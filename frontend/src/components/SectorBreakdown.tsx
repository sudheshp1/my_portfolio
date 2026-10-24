import type { ReactNode } from "react";

import { formatINR, type Breakdown, type BreakdownBucket } from "@/lib/api";

const MAX_SECTORS = 8;

const CAP_ORDER = ["large", "mid", "small", "micro", "unclassified"];
const CAP_LABELS: Record<string, string> = {
  large: "Large cap",
  mid: "Mid cap",
  small: "Small cap",
  micro: "Micro cap",
  unclassified: "Unclassified",
};
const capColor = (cap: string) => (cap === "unclassified" ? "var(--chart-context)" : `var(--cap-${cap})`);

const pct = (value: number, total: number) => (total ? (value / total) * 100 : 0);

/** Top sectors, with the long tail folded into "Other" and "Unclassified" kept last. */
function topSectors(sectors: BreakdownBucket[]): BreakdownBucket[] {
  const known = sectors.filter((s) => s.name !== "Unclassified");
  const unclassified = sectors.find((s) => s.name === "Unclassified");
  const shown = known.slice(0, MAX_SECTORS);
  const rest = known.slice(MAX_SECTORS);
  if (rest.length) {
    shown.push({
      name: `Other (${rest.length} sectors)`,
      value: rest.reduce((sum, s) => sum + s.value, 0),
      count: rest.reduce((sum, s) => sum + s.count, 0),
    });
  }
  if (unclassified) shown.push(unclassified);
  return shown;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">{title}</p>
      {children}
    </div>
  );
}

export default function SectorBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const { total } = breakdown;
  if (total <= 0) return null;

  const sectors = topSectors(breakdown.sectors);
  const maxSector = Math.max(...sectors.map((s) => s.value));
  const caps = [...breakdown.market_caps].sort((a, b) => CAP_ORDER.indexOf(a.name) - CAP_ORDER.indexOf(b.name));

  return (
    <div className="space-y-2">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sectors (stocks & ETFs)">
          <ul className="space-y-2.5">
            {sectors.map((s) => (
              <li
                key={s.name}
                className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] sm:grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 text-sm"
                title={`${s.name}: ${formatINR(s.value)} · ${s.count} holding${s.count === 1 ? "" : "s"}`}
              >
                <span className="truncate text-zinc-600 dark:text-zinc-300">{s.name}</span>
                <span className="h-2.5 overflow-hidden rounded-r bg-transparent">
                  <span
                    className="block h-full rounded-r"
                    style={{
                      width: `${(s.value / maxSector) * 100}%`,
                      background: s.name === "Unclassified" ? "var(--chart-context)" : "var(--series-equity)",
                    }}
                  />
                </span>
                <span className="w-14 text-right font-medium tabular-nums">{pct(s.value, total).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Market cap (stocks & ETFs)">
          <div className="flex h-3 gap-0.5 overflow-hidden rounded">
            {caps.map((c) => (
              <div
                key={c.name}
                style={{ width: `${pct(c.value, total)}%`, background: capColor(c.name) }}
                title={`${CAP_LABELS[c.name] ?? c.name}: ${formatINR(c.value)}`}
              />
            ))}
          </div>
          <ul className="mt-4 grid gap-2 text-sm">
            {caps.map((c) => (
              <li key={c.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: capColor(c.name) }} />
                <span className="text-zinc-600 dark:text-zinc-300">{CAP_LABELS[c.name] ?? c.name}</span>
                <span className="text-xs text-zinc-400">
                  {c.count} holding{c.count === 1 ? "" : "s"}
                </span>
                <span className="ml-auto font-medium tabular-nums">{pct(c.value, total).toFixed(1)}%</span>
                <span className="w-24 text-right tabular-nums text-zinc-500">{formatINR(c.value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-zinc-400">
            Tiers by NSE index membership: Nifty 100 = large, Midcap 150 = mid, Smallcap 250 = small, Microcap 250 =
            micro.
          </p>
        </Card>
      </div>

      {(breakdown.unclassified.length > 0 || breakdown.error) && (
        <p className="px-1 text-xs text-zinc-500">
          {breakdown.error && <span className="text-amber-700 dark:text-amber-400">{breakdown.error}. </span>}
          {breakdown.unclassified.length > 0 &&
            `Unclassified (not in NSE's broad indices — usually ETFs or very small companies): ${breakdown.unclassified.join(", ")}`}
        </p>
      )}
    </div>
  );
}
