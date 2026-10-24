"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import TradebookImport from "@/components/TradebookImport";
import {
  ASSET_LABELS,
  formatDate,
  formatINR,
  formatPct,
  formatPrice,
  formatQty,
  formatSigned,
  getHoldingDetail,
  type HoldingDetail,
} from "@/lib/api";

const CAP_LABELS: Record<string, string> = { large: "Large cap", mid: "Mid cap", small: "Small cap", micro: "Micro cap" };
const TXN_LABELS = { buy: "Buy", sell: "Sell", dividend: "Dividend", charge: "Tax/charge" };
const CAS_ACCOUNT = "CAMS / KFintech"; // backend/app/services/cas_import.py ACCOUNT_NAME

function tone(n: number) {
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

function Stat({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="text-xs tabular-nums text-zinc-500">{sub}</p>}
    </div>
  );
}

export default function HoldingView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<HoldingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // bumped after an import to refetch

  useEffect(() => {
    let cancelled = false;
    getHoldingDetail(id).then(
      (d) => {
        if (!cancelled) setDetail(d);
      },
      (e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this holding");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const inst = detail?.instrument;
  const h = detail?.holding;
  const fromCas = h?.account === CAS_ACCOUNT;
  const title = inst ? (inst.asset_class === "equity" ? inst.symbol ?? inst.name : inst.name) : "";
  const tags = inst
    ? [
        ASSET_LABELS[inst.asset_class] ?? inst.asset_class,
        inst.sector,
        inst.market_cap && CAP_LABELS[inst.market_cap],
        inst.isin,
      ].filter(Boolean)
    : [];

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← All holdings
      </Link>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      {!detail && !error && <p className="text-sm text-zinc-500">Loading…</p>}

      {detail && inst && (
        <>
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {inst.asset_class === "equity" && inst.name !== title && <p className="text-zinc-500">{inst.name}</p>}
            <p className="mt-1 text-sm text-zinc-500">{tags.join(" · ")}</p>
          </header>

          {h ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Current value" value={formatINR(h.current_value)} />
              <Stat label="Invested" value={formatINR(h.invested)} />
              <Stat
                label="P&L"
                value={formatSigned(h.pnl)}
                sub={formatPct(h.pnl_pct)}
                valueClass={tone(h.pnl)}
              />
              <Stat
                label="XIRR"
                value={detail.xirr === null ? "—" : formatPct(detail.xirr)}
                sub={
                  detail.xirr === null
                    ? "Import tradebook to calculate"
                    : detail.quantity_mismatch
                      ? `On the ${formatQty(detail.xirr_quantity)} units your trades cover`
                      : "Annualised, from your trades"
                }
                valueClass={detail.xirr === null ? "" : tone(detail.xirr)}
              />
              <Stat label="Quantity" value={formatQty(h.quantity)} />
              <Stat label="Avg cost" value={formatPrice(h.avg_cost)} />
              <Stat label="Last price" value={formatPrice(h.last_price)} />
              {inst.asset_class === "equity" ? (
                <Stat
                  label="Today"
                  value={formatSigned(h.day_change)}
                  sub={formatPct(h.day_change_pct)}
                  valueClass={tone(h.day_change)}
                />
              ) : (
                <Stat label="Held since" value={detail.first_buy ? formatDate(detail.first_buy) : "—"} />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Status" value="No longer held" />
              <Stat
                label="XIRR"
                value={detail.xirr === null ? "—" : formatPct(detail.xirr)}
                sub="On the closed position"
                valueClass={detail.xirr === null ? "" : tone(detail.xirr)}
              />
            </div>
          )}

          {detail.quantity_mismatch && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Your imported trades add up to {formatQty(detail.transactions_quantity)} units, but you hold{" "}
              {formatQty(h?.quantity ?? 0)}. This usually means a bonus, split, demat transfer, or trades older than
              the imported tradebook. XIRR only counts the units your trades cover — import older tradebooks to
              complete it.
            </p>
          )}

          <section className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div>
                <h2 className="font-medium">Transactions</h2>
                <p className="text-xs text-zinc-500">
                  {fromCas ? "From your CAS statement" : "From Zerodha Console tradebook imports"}
                  {detail.first_buy && ` · first buy ${formatDate(detail.first_buy)}`}
                </p>
              </div>
              {!fromCas && <TradebookImport onImported={() => setVersion((v) => v + 1)} />}
            </div>

            {detail.transactions.length === 0 && fromCas ? (
              <p className="p-6 text-sm text-zinc-500">
                No transactions in the imported CAS. Import a <strong>detailed</strong> CAS on the{" "}
                <Link href="/import" className="underline">
                  Import page
                </Link>{" "}
                to see them and calculate XIRR.
              </p>
            ) : detail.transactions.length === 0 ? (
              <div className="space-y-2 p-6 text-sm text-zinc-500">
                <p>No transactions yet. Kite&apos;s API only shares today&apos;s trades, so history comes from Console:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open console.zerodha.com → Reports → Tradebook.</li>
                  <li>Pick the segment (Equity, or Mutual funds) and a date range covering your purchases.</li>
                  <li>Download the CSV and import it here. Repeat per year if needed — duplicates are skipped.</li>
                </ol>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-500 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 text-right font-medium">Qty</th>
                      <th className="px-4 py-3 text-right font-medium">Price</th>
                      <th className="px-4 py-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
                    {detail.transactions.map((t, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap px-4 py-3">{formatDate(t.date)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              t.type === "buy"
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            }`}
                          >
                            {TXN_LABELS[t.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">{t.quantity ? formatQty(t.quantity) : "—"}</td>
                        <td className="px-4 py-3 text-right">{t.price ? formatPrice(t.price) : "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {t.type === "charge" ? formatPrice(t.amount) : formatINR(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
