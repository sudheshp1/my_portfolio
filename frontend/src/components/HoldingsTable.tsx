"use client";

import { useMemo, useState } from "react";

import {
  ASSET_LABELS,
  formatINR,
  formatPct,
  formatPrice,
  formatQty,
  formatSigned,
  type Holding,
} from "@/lib/api";

type SortKey = "name" | "invested" | "current_value" | "pnl" | "pnl_pct" | "day_change";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "invested", label: "Invested" },
  { key: "current_value", label: "Current" },
  { key: "pnl", label: "P&L" },
  { key: "pnl_pct", label: "P&L %" },
  { key: "day_change", label: "Today" },
];

function tone(n: number) {
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

function displayName(h: Holding) {
  return h.asset_class === "equity" ? h.symbol ?? h.name : h.name;
}

export default function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "current_value", desc: true });

  const classes = useMemo(() => Array.from(new Set(holdings.map((h) => h.asset_class))), [holdings]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter(
      (h) =>
        (filter === "all" || h.asset_class === filter) &&
        (!q || displayName(h).toLowerCase().includes(q) || (h.isin ?? "").toLowerCase().includes(q)),
    );
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) =>
      sort.key === "name"
        ? displayName(a).localeCompare(displayName(b)) * dir
        : (a[sort.key] - b[sort.key]) * dir,
    );
  }, [holdings, filter, query, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.desc ? " ↓" : " ↑") : "");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1">
          {["all", ...classes].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                filter === c
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {c === "all" ? `All (${holdings.length})` : ASSET_LABELS[c] ?? c}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or ISIN"
          className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-400 sm:w-64 dark:border-zinc-700"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="cursor-pointer px-4 py-3 font-medium" onClick={() => toggleSort("name")}>
                Holding{arrow("name")}
              </th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Avg / LTP</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="cursor-pointer whitespace-nowrap px-4 py-3 text-right font-medium"
                  onClick={() => toggleSort(c.key)}
                >
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 tabular-nums dark:divide-zinc-800">
            {rows.map((h) => (
              <tr key={`${h.account}-${h.isin ?? h.symbol}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-4 py-3">
                  <p className="max-w-xs truncate font-medium" title={h.name}>
                    {displayName(h)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {ASSET_LABELS[h.asset_class] ?? h.asset_class} · {h.account}
                  </p>
                </td>
                <td className="px-4 py-3 text-right">{h.asset_class === "cash" ? "—" : formatQty(h.quantity)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {h.asset_class === "cash" ? (
                    "—"
                  ) : (
                    <>
                      <p>{formatPrice(h.avg_cost)}</p>
                      <p className="text-xs text-zinc-500">{formatPrice(h.last_price)}</p>
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{formatINR(h.invested)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatINR(h.current_value)}</td>
                {h.asset_class === "cash" ? (
                  <>
                    <td className="px-4 py-3 text-right text-zinc-400">—</td>
                    <td className="px-4 py-3 text-right text-zinc-400">—</td>
                  </>
                ) : (
                  <>
                    <td className={`px-4 py-3 text-right ${tone(h.pnl)}`}>{formatSigned(h.pnl)}</td>
                    <td className={`px-4 py-3 text-right ${tone(h.pnl_pct)}`}>{formatPct(h.pnl_pct)}</td>
                  </>
                )}
                {/* Kite doesn't report a daily change for MFs or cash */}
                {h.asset_class === "equity" ? (
                  <td className={`px-4 py-3 text-right ${tone(h.day_change)}`}>{formatSigned(h.day_change)}</td>
                ) : (
                  <td className="px-4 py-3 text-right text-zinc-400">—</td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                  No holdings match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
