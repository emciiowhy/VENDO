/**
 * Client for the Super Admin billing analytics (`/api/v1/admin/analytics/*`).
 * SUPER_ADMIN-only server-side; the session cookie rides along with
 * `credentials: "include"`. Money is integer centavos on the wire.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/admin/analytics`;

export type Plan = "starter" | "business" | "enterprise";

export interface PlanBreakdownRow {
  plan: Plan;
  label: string;
  stores: number;
  priceCents: number;
  mrrCents: number;
}

export interface FeeTrendPoint {
  month: string; // YYYY-MM-01
  gmvCents: number;
  feeCents: number;
  txns: number;
}

export interface MrrTrendPoint {
  month: string; // YYYY-MM-01
  mrrCents: number;
  stores: number;
}

export interface BillingAnalytics {
  mrrCents: number;
  activeStores: number;
  arpaCents: number;
  arrCents: number;
  byPlan: PlanBreakdownRow[];
  feeTrend: FeeTrendPoint[];
  mrrTrend: MrrTrendPoint[];
  feeRatePct: number;
}

export interface Subscriber {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  status: string;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
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

export async function getBillingAnalytics(): Promise<Result<{ analytics: BillingAnalytics }>> {
  try {
    return await readJson(await fetch(`${BASE}/billing`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getSubscribers(): Promise<Result<{ subscribers: Subscriber[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/subscribers`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
