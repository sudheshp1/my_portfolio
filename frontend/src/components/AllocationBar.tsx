import { ASSET_LABELS, formatINR, type Summary } from "@/lib/api";

const COLORS: Record<string, string> = {
  equity: "bg-indigo-500",
  mf: "bg-sky-500",
  debt: "bg-amber-500",
  gold: "bg-yellow-400",
  cash: "bg-zinc-400",
  other: "bg-fuchsia-500",
};

export default function AllocationBar({ summary }: { summary: Summary }) {
  const total = summary.current_value || 1;
  const classes = Object.entries(summary.by_asset_class).sort((a, b) => b[1].current_value - a[1].current_value);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Allocation</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        {classes.map(([cls, t]) => (
          <div
            key={cls}
            className={COLORS[cls] ?? COLORS.other}
            style={{ width: `${(t.current_value / total) * 100}%` }}
            title={ASSET_LABELS[cls] ?? cls}
          />
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {classes.map(([cls, t]) => (
          <li key={cls} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${COLORS[cls] ?? COLORS.other}`} />
            <span className="text-zinc-600 dark:text-zinc-300">{ASSET_LABELS[cls] ?? cls}</span>
            <span className="tabular-nums font-medium">{((t.current_value / total) * 100).toFixed(1)}%</span>
            <span className="tabular-nums text-zinc-500">{formatINR(t.current_value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
