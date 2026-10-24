"use client";

import { useEffect, useState } from "react";

import AllocationBar from "@/components/AllocationBar";
import HoldingsTable from "@/components/HoldingsTable";
import NetWorthChart from "@/components/NetWorthChart";
import SummaryCards from "@/components/SummaryCards";
import TopMovers from "@/components/TopMovers";
import {
  API_URL,
  getHistory,
  getHoldings,
  getSummary,
  runSync,
  type HistoryPoint,
  type Holding,
  type Summary,
} from "@/lib/api";

const fetchDashboard = () => Promise.all([getSummary(), getHoldings(), getHistory()]);
const BACKEND_DOWN = `Can't reach the backend at ${API_URL}. Is it running?`;

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const [s, h, hist] = await fetchDashboard();
      setSummary(s);
      setHoldings(h);
      setHistory(hist);
      setError(null);
    } catch {
      setError(BACKEND_DOWN);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    if (params.has("kite")) window.history.replaceState(null, "", "/");
    fetchDashboard()
      .then(([s, h, hist]) => {
        if (cancelled) return;
        setSummary(s);
        setHoldings(h);
        setHistory(hist);
        if (params.get("sync") === "failed") setNotice("Logged in, but the automatic sync failed. Try Sync now.");
      })
      .catch(() => {
        if (!cancelled) setError(BACKEND_DOWN);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await runSync();
      const failed = Object.keys(result.errors);
      if (failed.length) setNotice(`Synced, but these failed: ${failed.join(", ")}. Showing last known data for them.`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Portfolio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {summary?.last_synced
              ? `Last synced ${new Date(summary.last_synced).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
              : "Not synced yet"}
          </p>
        </div>
        {summary &&
          (summary.kite_connected ? (
            <button
              onClick={sync}
              disabled={syncing}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          ) : (
            <a
              href={`${API_URL}/kite/login`}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
            >
              Login with Kite
            </a>
          ))}
      </header>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {notice}
        </p>
      )}
      {summary && !summary.kite_connected && summary.last_synced && (
        <p className="text-sm text-zinc-500">Kite session expired — showing data from the last sync. Log in to refresh.</p>
      )}

      {summary && (
        <>
          <SummaryCards summary={summary} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <NetWorthChart history={history} />
            </div>
            <AllocationBar summary={summary} />
          </div>
          <TopMovers holdings={holdings} />
          <HoldingsTable holdings={holdings} />
        </>
      )}
      {!summary && !error && <p className="text-sm text-zinc-500">Loading…</p>}
    </main>
  );
}
