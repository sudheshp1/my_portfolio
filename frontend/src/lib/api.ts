export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type AssetClass = "equity" | "mf" | "debt" | "gold" | "cash" | "other";

export interface Holding {
  account: string;
  isin: string | null;
  symbol: string | null;
  name: string;
  asset_class: AssetClass;
  quantity: number;
  avg_cost: number;
  last_price: number;
  invested: number;
  current_value: number;
  pnl: number;
  pnl_pct: number;
  day_change: number;
  as_of: string;
}

interface Totals {
  invested: number;
  current_value: number;
  day_change: number;
}

export interface Summary extends Totals {
  pnl: number;
  pnl_pct: number;
  day_change_pct: number;
  by_asset_class: Record<string, Totals>;
  last_synced: string | null;
  kite_connected: boolean;
}

export interface SyncResult {
  synced_at: string;
  counts: Record<string, number>;
  errors: Record<string, string>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const getSummary = () => request<Summary>("/summary");
export const getHoldings = () => request<Holding[]>("/holdings");
export const runSync = () => request<SyncResult>("/sync", { method: "POST" });

export const ASSET_LABELS: Record<string, string> = {
  equity: "Stocks",
  mf: "Mutual funds",
  debt: "Debt",
  gold: "Gold",
  cash: "Cash",
  other: "Other",
};

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const qty = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

export const formatINR = (n: number) => inr.format(n);
export const formatPrice = (n: number) => inrPrecise.format(n);
export const formatQty = (n: number) => qty.format(n);
export const formatPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
export const formatSigned = (n: number) => `${n >= 0 ? "+" : "−"}${inr.format(Math.abs(n))}`;
