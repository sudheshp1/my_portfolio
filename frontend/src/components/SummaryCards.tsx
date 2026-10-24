import { formatINR, formatPct, formatSigned, type Summary } from "@/lib/api";

function tone(n: number) {
  return n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
}

function Card({ label, value, sub, subClass }: { label: string; value: string; sub?: string; subClass?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className={`mt-1 text-sm tabular-nums ${subClass ?? "text-zinc-500"}`}>{sub}</p>}
    </div>
  );
}

export default function SummaryCards({ summary }: { summary: Summary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Current value" value={formatINR(summary.current_value)} />
      <Card label="Invested" value={formatINR(summary.invested)} />
      <Card
        label="Total P&L"
        value={formatSigned(summary.pnl)}
        sub={formatPct(summary.pnl_pct)}
        subClass={tone(summary.pnl)}
      />
      <Card
        label="Today"
        value={formatSigned(summary.day_change)}
        sub={formatPct(summary.day_change_pct)}
        subClass={tone(summary.day_change)}
      />
    </div>
  );
}
