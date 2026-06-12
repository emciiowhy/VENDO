/**
 * Client for the merchant analytics + BIR compliance API (`/api/v1/merchant/*`
 * and `/api/v1/inventory/alerts`). Tenant scope is enforced server-side from
 * the session cookie, so every call rides with `credentials: "include"`. Money
 * is integer centavos on the wire.
 */
import { API_BASE_URL } from "./api";

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

// ── Low-stock alerts ────────────────────────────────────────────────────────

export interface StockAlert {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  depleted: boolean;
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

export async function getStockAlerts(): Promise<Result<{ alerts: StockAlert[] }>> {
  try {
    return await readJson(await fetch(`${V1}/inventory/alerts`, { credentials: "include" }));
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
