/**
 * Client for the merchant analytics + BIR compliance API (`/api/v1/merchant/*`
 * and `/api/v1/inventory/alerts`). Tenant scope is enforced server-side from
 * the session cookie, so every call rides with `credentials: "include"`. Money
 * is integer centavos on the wire.
 */
import { API_BASE_URL } from "./api";
import type { SaleDetail } from "./pos";

const V1 = `${API_BASE_URL}/api/v1`;

// ── Dashboard "Pulse" analytics ─────────────────────────────────────────────

export interface HourPoint {
  hour: number;
  grossCents: number;
  txns: number;
}

export interface MethodSlice {
  method: string;
  txns: number;
  grossCents: number;
}

export interface TopItem {
  name: string;
  qty: number;
  revenueCents: number;
}

export interface DashboardPulse {
  day: string;
  grossCents: number;
  txns: number;
  aovCents: number;
  itemsSold: number;
  netCents: number;
  vatCents: number;
  discountCents: number;
  hourly: HourPoint[];
  byMethod: MethodSlice[];
  topItems: TopItem[];
  lowStockCount: number;
}

// ── Owner at-a-glance summary (mobile) ──────────────────────────────────────

export interface OwnerSummary {
  day: string;
  grossCents: number;
  activeRegisters: number;
  lowStockCount: number;
}

// ── Low-stock alerts ────────────────────────────────────────────────────────

export interface StockAlert {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  depleted: boolean;
}

// ── Predictive inventory forecast (ENTERPRISE) ──────────────────────────────

/** How soon a flagged item needs attention (mirrors backend forecast.ts). */
export type ForecastUrgency = "out" | "critical" | "soon" | "low";

export interface ForecastItem {
  productId: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  unitsSoldInWindow: number;
  dailyVelocity: number;
  daysToStockout: number | null;
  suggestedOrderQty: number;
  urgency: ForecastUrgency;
}

export interface ReorderForecast {
  generatedAt: string;
  windowDays: number;
  coverDays: number;
  horizonDays: number;
  items: ForecastItem[];
  summary: {
    atRisk: number;
    outOfStock: number;
    suggestedUnitsTotal: number;
  };
}

// ── BIR compliance ledger ───────────────────────────────────────────────────

export interface ComplianceRow {
  reference: string;
  at: string;
  paymentMethod: string;
  paymentRef: string | null;
  grossCents: number;
  netCents: number;
  vatCents: number;
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
  discountCents: number;
}

export interface ComplianceLedger {
  periodStart: string;
  periodEnd: string;
  rows: ComplianceRow[];
  totals: {
    grossCents: number;
    netCents: number;
    vatCents: number;
    vatableSalesCents: number;
    vatExemptCents: number;
    zeroRatedCents: number;
    discountCents: number;
    count: number;
  };
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error?: string };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

export async function getDashboardPulse(): Promise<Result<{ pulse: DashboardPulse }>> {
  try {
    return await readJson(
      await fetch(`${V1}/merchant/analytics/dashboard`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

// ── Ranged sales totals (owner overview strip) ──────────────────────────────

export const SALES_RANGES = ["today", "7d", "30d", "month", "all"] as const;
export type SalesRange = (typeof SALES_RANGES)[number];

/** Human labels for each range, for the selector chips. */
export const SALES_RANGE_LABELS: Record<SalesRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  month: "This month",
  all: "All-time",
};

export interface SalesTotals {
  range: SalesRange;
  from: string;
  to: string;
  grossCents: number;
  txns: number;
  aovCents: number;
  /** Store expenses over the window; null when not entitled to Finance. */
  expensesCents: number | null;
  /** Sales − expenses; null when expenses aren't available. */
  netCents: number | null;
}

/** Total sales / transactions / AOV over the given window. */
export async function getSalesTotals(range: SalesRange): Promise<Result<{ totals: SalesTotals }>> {
  try {
    return await readJson(
      await fetch(`${V1}/merchant/analytics/totals?range=${range}`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function getStockAlerts(): Promise<Result<{ alerts: StockAlert[] }>> {
  try {
    return await readJson(await fetch(`${V1}/inventory/alerts`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** The owner's mobile at-a-glance vitals (gross today, open registers, low stock). */
export async function getOwnerSummary(): Promise<Result<{ summary: OwnerSummary }>> {
  try {
    return await readJson(await fetch(`${V1}/merchant/analytics/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/**
 * The ENTERPRISE predictive reorder forecast. The endpoint is tier-gated, so a
 * below-tier session gets a 403 — `readJson` surfaces that as a graceful
 * `{ ok: false }` rather than throwing (the panel is hidden behind the same gate
 * anyway, this just makes a tier mismatch fail soft).
 */
export async function getReorderForecast(): Promise<Result<{ forecast: ReorderForecast }>> {
  try {
    return await readJson(
      await fetch(`${V1}/merchant/analytics/forecast`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function getComplianceLedger(
  month: string,
): Promise<Result<{ label: string; ledger: ComplianceLedger }>> {
  try {
    return await readJson(
      await fetch(`${V1}/merchant/compliance/export?month=${encodeURIComponent(month)}`, {
        credentials: "include",
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** Absolute URL that streams the month's ledger as a downloadable CSV. */
export function complianceCsvUrl(month: string): string {
  return `${V1}/merchant/compliance/export?month=${encodeURIComponent(month)}&format=csv`;
}

// ── Sales ledger (owner's record of every transaction) ──────────────────────

export type SaleStatus = SaleDetail["status"];

export interface SalesLedgerRow {
  id: string;
  reference: string;
  status: SaleStatus;
  totalCents: number;
  discountCents: number;
  vatCents: number;
  paymentMethod: string;
  cashierName: string | null;
  customerName: string | null;
  /** Units rung up on the sale. */
  itemsCount: number;
  lineCount: number;
  /** Up to three item names for the row preview. */
  itemNames: string[];
  /** Money already given back on this sale (voids/returns). */
  refundedCents: number;
  createdAt: string;
}

export interface SalesLedgerSummary {
  txns: number;
  grossCents: number;
  refundedCents: number;
  netCents: number;
  itemsSold: number;
  discountCents: number;
  vatCents: number;
  avgCents: number;
  byMethod: { method: string; txns: number; totalCents: number }[];
}

export interface SalesFilter {
  from?: string;
  to?: string;
  status?: SaleStatus | "";
  paymentMethod?: string;
  cashierId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface SaleReversalLine {
  id: string;
  reference: string;
  kind: "void" | "return";
  amountCents: number;
  reason: string | null;
  processedBy: string | null;
  createdAt: string;
}

/** One sale's full record: receipt lines, payment, VAT, and any refunds. */
export interface SaleRecord extends SaleDetail {
  scPwdType: "senior" | "pwd" | null;
  pointsEarned: number;
  pointsRedeemed: number;
  reversals: SaleReversalLine[];
}

export async function listSalesLedger(f: SalesFilter): Promise<
  Result<{
    sales: SalesLedgerRow[];
    total: number;
    page: number;
    pageSize: number;
    summary: SalesLedgerSummary;
    cashiers: { userId: string; name: string }[];
  }>
> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") qs.set(k, String(v));
  try {
    return await readJson(await fetch(`${V1}/merchant/sales?${qs}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getSaleRecord(id: string): Promise<Result<{ sale: SaleRecord }>> {
  try {
    return await readJson(await fetch(`${V1}/merchant/sales/${encodeURIComponent(id)}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
