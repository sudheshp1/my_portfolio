import type { ReactNode } from "react";

import { formatPct, formatSigned, type Holding } from "@/lib/api";

const LIMIT = 3;

function tone(n: number) {
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

function displayName(h: Holding) {
  return h.asset_class === "equity" ? h.symbol ?? h.name : h.name;
}

function MoverList({ title, rows, pct, amount }: {
  title: string;
  rows: Holding[];
  pct: (h: Holding) => number;
  amount: (h: Holding) => number;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="py-2 text-sm text-zinc-400">None</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((h) => (
            <li key={`${h.account}-${h.isin ?? h.symbol}`} className="flex items-baseline gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={h.name}>
                {displayName(h)}
              </span>
              <span className="whitespace-nowrap tabular-nums text-xs text-zinc-500">{formatSigned(amount(h))}</span>
              <span className={`w-20 whitespace-nowrap text-right font-medium tabular-nums ${tone(pct(h))}`}>
                {pct(h) >= 0 ? "▲" : "▼"} {formatPct(pct(h)).replace(/^[+-]/, "")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export default function TopMovers({ holdings }: { holdings: Holding[] }) {
  // Kite only reports a daily change for stocks/ETFs
  const stocks = holdings.filter((h) => h.asset_class === "equity");
  const byDay = [...stocks].sort((a, b) => b.day_change_pct - a.day_change_pct);
  const invested = holdings.filter((h) => h.asset_class !== "cash" && h.invested > 0);
  const byTotal = [...invested].sort((a, b) => b.pnl_pct - a.pnl_pct);

  const dayPct = (h: Holding) => h.day_change_pct;
  const dayAmt = (h: Holding) => h.day_change;
  const totalPct = (h: Holding) => h.pnl_pct;
  const totalAmt = (h: Holding) => h.pnl;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Today's movers">
        <MoverList title="Gainers" rows={byDay.filter((h) => h.day_change_pct > 0).slice(0, LIMIT)} pct={dayPct} amount={dayAmt} />
        <MoverList
          title="Losers"
          rows={byDay.filter((h) => h.day_change_pct < 0).reverse().slice(0, LIMIT)}
          pct={dayPct}
          amount={dayAmt}
        />
      </Panel>
      <Panel title="Overall return">
        <MoverList title="Highest" rows={byTotal.slice(0, LIMIT)} pct={totalPct} amount={totalAmt} />
        <MoverList
          title="Lowest"
          rows={byTotal.slice(LIMIT).slice(-LIMIT).reverse()}
          pct={totalPct}
          amount={totalAmt}
        />
      </Panel>
    </div>
  );
}
