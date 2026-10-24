# My Portfolio Portal — Build Plan

A local-first portal to see all holdings in one place, primarily from Zerodha (Kite + Coin), plus mutual funds held elsewhere and manually tracked assets.

Status legend: ⬜ Not started · 🟨 In progress · ✅ Done

---

## 0. Decisions

| Topic | Decision | Notes |
|---|---|---|
| Backend | Python + FastAPI | Official `kiteconnect` SDK, `casparser`, `pyxirr` are all Python |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui | Charts via Recharts |
| Database | SQLite (via SQLAlchemy) | Single file, easy backup; can move to Postgres later |
| Hosting | Localhost only | Optional later: Tailscale / Cloudflare Access for phone access |
| Primary key across sources | ISIN | Merges the same stock/fund from different sources |

Open questions:
- [ ] Kite Connect developer account created? (personal vs paid tier)
- [ ] Which non-Zerodha holdings matter most? (MFs outside Coin, EPF/PPF, FDs, US stocks, gold, crypto)

---

## 1. Data Sources

| Source | Covers | Access method |
|---|---|---|
| Kite Connect API | Equity holdings, positions, funds/margins, Coin MF holdings, orders/trades | OAuth login → daily access token |
| CAS PDF (CAMS/KFintech or NSDL/CDSL) | All MFs under your PAN, demat holdings at other brokers | Upload PDF → parse with `casparser` |
| AMFI NAV file | Daily NAV of every MF scheme | Free text file from amfiindia.com, fetched daily |
| Manual entry / CSV | FDs, PPF/EPF/NPS, gold/SGB, real estate, US stocks, crypto | Forms in the portal |

**Kite token limitation:** the access token expires daily (~6 AM). The user must click "Login with Kite" once per day. Do **not** automate login via TOTP scraping (against Zerodha ToS). Every sync stores a snapshot so the portal remains usable on days without login.

---

## 2. Architecture

```
┌──────────────┐     ┌──────────────────────────┐     ┌─────────────┐
│ Next.js UI   │ ──▶ │ FastAPI backend (Python) │ ──▶ │ SQLite      │
│ dashboard,   │     │ - Kite OAuth + sync      │     │ holdings,   │
│ charts       │     │ - CAS parser             │     │ snapshots,  │
└──────────────┘     │ - NAV/price fetcher      │     │ txns        │
                     │ - XIRR / analytics       │     └─────────────┘
                     └──────────────────────────┘
```

Planned repo layout:

```
my_portfolio/
├── backend/            # FastAPI app
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py   # loads .env
│   │   ├── db.py
│   │   ├── models.py
│   │   ├── routers/    # kite, holdings, cas, manual, analytics
│   │   └── services/   # kite_sync, cas_import, nav_fetch, xirr
│   ├── requirements.txt
│   └── .env.example
├── frontend/           # Next.js app
├── data/               # SQLite DB + uploaded CAS files (gitignored)
├── PLAN.md
└── README.md
```

---

## 3. Data Model

| Table | Key fields |
|---|---|
| `accounts` | id, name (Zerodha / CAMS / Manual …), type |
| `instruments` | id, isin, symbol, name, asset_class (equity / mf / debt / gold / cash / other), sector, market_cap |
| `holdings` | account_id, instrument_id, quantity, avg_cost, last_price, as_of |
| `transactions` | account_id, instrument_id, date, type (buy / sell / sip / dividend), quantity, price, amount |
| `daily_snapshots` | date, asset_class, invested, current_value |
| `kite_session` | access_token (encrypted), user_id, created_at, expires_at |

---

## 4. Build Steps

### Phase 1 — Zerodha read-only sync

| # | Step | Status | Notes |
|---|---|---|---|
| 1.1 | Register Kite Connect app; redirect URL `http://localhost:8000/kite/callback` | ✅ | Store `KITE_API_KEY`, `KITE_API_SECRET` in `backend/.env` |
| 1.2 | Scaffold FastAPI backend, config, SQLite + models | ✅ | All tables from §3 created on startup in `data/portfolio.db` |
| 1.3 | `/kite/login` → redirect to Kite; `/kite/callback` → exchange request token for access token | ✅ | Verified with real login. Token encrypted with `data/secret.key`; `/kite/status` and `/kite/profile` added |
| 1.4 | Sync service: pull holdings, MF holdings, funds → DB + write daily snapshot | ✅ | Verified against real account — totals match Kite/Coin. Runs automatically after login. Equity qty includes T1 shares; funds stored as a `cash` holding. If one source fails, its old rows are kept. Positions are **not stored** (served live via `/positions`) |
| 1.5 | API endpoints: `POST /sync`, `/holdings`, `/summary`, `/positions` | ✅ | Verified against real account |
| 1.6 | Scaffold Next.js frontend; holdings table + totals (invested, current, P&L, day change) | ✅ | Next.js 16 + Tailwind 4 (shadcn deferred). Summary cards, allocation bar, sortable/filterable holdings table, Login/Sync buttons. Verified with real data |

**Done when:** after logging in with Kite, the UI shows all Zerodha holdings with correct totals.

### Phase 2 — Dashboard

| # | Step | Status | Notes |
|---|---|---|---|
| 2.1 | Net-worth headline + day change | ✅ | Covered by the summary cards from 1.6 |
| 2.2 | Asset-allocation chart | ✅ | Kept as a stacked bar instead of a donut (easier to compare parts). Fixed, colorblind-validated color per asset class in `globals.css` (light + dark). |
| 2.3 | Net-worth-over-time chart (from snapshots) | ✅ | `GET /history` + Recharts area chart (value) with dashed invested line, hover tooltip, 1M/3M/1Y/All. History only exists from the first sync onward. |
| 2.4 | Top gainers / losers | ✅ | Today's movers (stocks by day %) and overall return (highest/lowest by P&L %). `day_change_pct` added to `/holdings`. |
| 2.5 | Sector and market-cap breakdown | ✅ | Source: NSE index constituent CSVs from `archives.nseindia.com` (Total Market list for industry; Nifty 100 / Midcap 150 / Smallcap 250 / Microcap 250 for cap tier), matched by ISIN. Cached in `data/reference/`, refreshed monthly or via `POST /reference/refresh`. `GET /breakdown` covers stocks & ETFs only (MFs excluded); ETFs show as Unclassified. |
| 2.6 | Holding detail page (transactions, avg cost, XIRR) | ✅ | `/holdings/[id]` page (Next.js Suspense + client view). Kite's API only returns today's trades, so history comes from **Console tradebook CSV** import (`POST /import/tradebook`; EQ + MF rows, deduped by trade_id; button on dashboard and detail page). XIRR via `pyxirr`, counting only units the imported trades cover; warns on quantity mismatch (bonus/split/transfer/older trades). Adds `transactions.external_id` (auto-migrated). Verified with a real Console tradebook |

### Phase 3 — Other holdings

| # | Step | Status | Notes |
|---|---|---|---|
| 3.1 | CAS PDF upload + parse with `casparser`; merge by ISIN | 🟨 | CAMS/KFintech CAS only, on the new `/import` page (`POST /import/cas`). Account "CAMS / KFintech"; holdings replaced per import (summed across folios by ISIN), transactions deduped. Unit-bearing rows typed by sign (handles reversals); dividends and stamp duty/STT/TDS kept for XIRR. Password is used once and never stored. Warns if a fund is also held via Zerodha Coin. NSDL/CDSL (demat) CAS rejected for now — it would double count Zerodha. Tested with constructed statements; needs a real CAS |
| 3.2 | Daily AMFI NAV fetch to revalue MFs | 🟨 | `portal.amfiindia.com/spages/NAVAll.txt`, cached 6h in `data/reference/`. Runs after each CAS import and when the dashboard loads (`POST /nav/refresh`); only non-Zerodha funds (Kite already prices Coin funds) |
| 3.3 | Manual asset forms (FD, PPF/EPF, gold, US stocks, crypto) | ⬜ | |
| 3.4 | CSV import for manual assets | ⬜ | |
| 3.5 | Depository CAS (NSDL/CDSL) for stocks at other brokers | ⬜ | Must skip Zerodha's demat account to avoid double counting |

### Phase 4 — Insights

| # | Step | Status | Notes |
|---|---|---|---|
| 4.1 | Portfolio and per-asset-class XIRR (`pyxirr`) | ⬜ | |
| 4.2 | Benchmark comparison vs Nifty 50 | ⬜ | |
| 4.3 | Target vs actual allocation + rebalancing hints | ⬜ | |
| 4.4 | Tax view: STCG/LTCG, harvesting tracker | ⬜ | |
| 4.5 | Alerts: concentration risk, large drawdowns | ⬜ | |

---

## 5. Security Checklist

- [ ] Secrets only in `.env`; `.env` and `data/` in `.gitignore`
- [ ] Access token stored encrypted at rest
- [ ] Only read-only Kite endpoints used — no order placement code
- [ ] Backend bound to `127.0.0.1` only
- [ ] If exposed beyond localhost: put behind Tailscale or Cloudflare Access

---

## 6. Running Locally

### Backend (first-time setup)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env    # then fill in KITE_API_KEY and KITE_API_SECRET
```

### Backend (every time)

```powershell
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend (first-time setup)

```powershell
cd frontend
npm install
```

### Frontend (every time, in a second terminal)

```powershell
cd frontend
npm run dev
```

Open http://localhost:3000. Optional: set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the backend isn't at `http://127.0.0.1:8000`.

### Daily Kite login

1. On the dashboard, click **Login with Kite** (shown when the session has expired) and log in with Zerodha.
2. You're redirected back to the dashboard; login triggers a sync automatically.
3. Use **Sync now** to refresh later in the day.

API docs: http://localhost:8000/docs

---

## 7. Change Log

| Date | Change |
|---|---|
| 2026-10-24 | Plan created |
| 2026-10-24 | Kite app registered (1.1); FastAPI backend, DB models, Kite login/callback built (1.2, 1.3) |
| 2026-10-24 | Real Kite login verified (1.3). Sync service + portfolio endpoints built (1.4, 1.5) |
| 2026-10-24 | Sync verified against real account (1.4, 1.5). Next.js dashboard built and verified (1.6) — **Phase 1 complete** |
| 2026-10-24 | Phase 2 started on branch `phase-2-dashboard`: allocation polish, net-worth chart, top movers (2.1–2.4) |
| 2026-10-24 | Merged into `main`. Sector & market-cap breakdown built on branch `phase-2-sectors` (2.5) |
| 2026-10-24 | 2.5 merged into `main`. Holding detail page + tradebook import + XIRR built on branch `phase-2-holding-detail` (2.6), verified with a real tradebook — **Phase 2 complete** |
| 2026-10-24 | Phase 3 started on branch `phase-3-other-holdings`: CAS import (3.1) and AMFI NAV refresh (3.2); dashboard header now links to an Import page |
| 2026-10-24 | Paused. Everything merged into `main`. **Next time:** import a real CAS to verify 3.1/3.2, then build 3.3 (manual assets: FD, PPF/EPF, gold, US stocks, crypto) |
