import { ASSET_LABELS, assetColor, formatINR, type Summary } from "@/lib/api";

export default function AllocationBar({ summary }: { summary: Summary }) {
  const total = summary.current_value || 1;
  const classes = Object.entries(summary.by_asset_class)
    .filter(([, t]) => t.current_value > 0)
    .sort((a, b) => b[1].current_value - a[1].current_value);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Allocation</p>
      {/* 2px gaps between segments; rounded ends on the outer segments only */}
      <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded">
        {classes.map(([cls, t]) => (
          <div
            key={cls}
            style={{ width: `${(t.current_value / total) * 100}%`, background: assetColor(cls) }}
            title={`${ASSET_LABELS[cls] ?? cls}: ${formatINR(t.current_value)}`}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-2 text-sm">
        {classes.map(([cls, t]) => (
          <li key={cls} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: assetColor(cls) }} />
            <span className="text-zinc-600 dark:text-zinc-300">{ASSET_LABELS[cls] ?? cls}</span>
            <span className="ml-auto font-medium tabular-nums">{((t.current_value / total) * 100).toFixed(1)}%</span>
            <span className="w-24 text-right tabular-nums text-zinc-500">{formatINR(t.current_value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
