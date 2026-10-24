"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCompactINR, formatINR, formatSigned, type HistoryPoint } from "@/lib/api";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "All", days: Infinity },
];

const shortDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const longDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });

interface TooltipProps {
  active?: boolean;
  payload?: { payload: HistoryPoint }[];
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const pnl = p.current_value - p.invested;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="mb-1 text-xs text-zinc-500">{longDate(p.date)}</p>
      <p className="flex items-center gap-2 tabular-nums">
        <span className="h-0.5 w-3 rounded" style={{ background: "var(--series-equity)" }} />
        Value <span className="ml-auto pl-4 font-medium">{formatINR(p.current_value)}</span>
      </p>
      <p className="flex items-center gap-2 tabular-nums">
        <span className="h-0.5 w-3 rounded" style={{ background: "var(--chart-context)" }} />
        Invested <span className="ml-auto pl-4">{formatINR(p.invested)}</span>
      </p>
      <p className="mt-1 text-xs tabular-nums text-zinc-500">P&L {formatSigned(pnl)}</p>
    </div>
  );
}

export default function NetWorthChart({ history }: { history: HistoryPoint[] }) {
  const [range, setRange] = useState("All");

  const data = useMemo(() => {
    const days = RANGES.find((r) => r.label === range)!.days;
    if (!Number.isFinite(days) || history.length === 0) return history;
    const cutoff = new Date(history[history.length - 1].date).getTime() - days * 86_400_000;
    return history.filter((p) => new Date(p.date).getTime() >= cutoff);
  }, [history, range]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Net worth over time</p>
          <div className="mt-1 flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ background: "var(--series-equity)" }} />
              Current value
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ background: "var(--chart-context)" }} />
              Invested
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.label)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                range === r.label
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {data.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-zinc-500">
          {history.length < 2
            ? "History builds up with each day you sync. Check back after a few days."
            : "Not enough data in this range yet."}
        </div>
      ) : (
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--series-equity)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--series-equity)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--chart-axis)" }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={formatCompactINR}
                tick={{ fill: "var(--chart-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={64}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              />
              <Line
                dataKey="invested"
                stroke="var(--chart-context)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                type="stepAfter"
                isAnimationActive={false}
              />
              <Area
                dataKey="current_value"
                stroke="var(--series-equity)"
                strokeWidth={2}
                fill="url(#valueFill)"
                type="monotone"
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
