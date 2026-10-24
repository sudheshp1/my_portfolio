export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type AssetClass = "equity" | "mf" | "debt" | "gold" | "cash" | "other";

export interface Holding {
  instrument_id: number;
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
  day_change_pct: number;
  as_of: string;
}

export interface HistoryPoint {
  date: string;
  invested: number;
  current_value: number;
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

export interface BreakdownBucket {
  name: string;
  value: number;
  count: number;
}

export interface Breakdown {
  total: number;
  sectors: BreakdownBucket[];
  market_caps: BreakdownBucket[];
  unclassified: string[];
  reference_updated: number | null;
  error: string | null;
}

export interface Transaction {
  date: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  amount: number;
}

export interface HoldingDetail {
  instrument: {
    id: number;
    isin: string | null;
    symbol: string | null;
    name: string;
    asset_class: AssetClass;
    sector: string | null;
    market_cap: string | null;
  };
  holding: Holding | null;
  transactions: Transaction[];
  xirr: number | null;
  first_buy: string | null;
  quantity_mismatch: boolean;
  transactions_quantity: number;
  xirr_quantity: number;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  skipped_segments: number;
  errors: string[];
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
export const getHistory = () => request<HistoryPoint[]>("/history");
export const getBreakdown = () => request<Breakdown>("/breakdown");
export const getHoldingDetail = (id: string) => request<HoldingDetail>(`/holdings/${encodeURIComponent(id)}`);
export const runSync = () => request<SyncResult>("/sync", { method: "POST" });

export function importTradebook(file: File) {
  const body = new FormData();
  body.append("file", file);
  return request<ImportResult>("/import/tradebook", { method: "POST", body });
}

/** Fixed color per asset class — color follows the class, never its rank. */
export const assetColor = (cls: string) =>
  `var(--series-${["equity", "mf", "cash", "gold", "debt"].includes(cls) ? cls : "other"})`;

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

export const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { dateStyle: "medium" });

/** Short Indian-style amounts for axes: ₹5.84L, ₹1.2Cr. */
export function formatCompactINR(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${+(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${+(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}₹${+(abs / 1e3).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs)}`;
}
