/**
 * Client for the Super Admin churn-risk watchlist (`/api/v1/admin/at-risk`).
 * SUPER_ADMIN-only server-side; the session cookie rides along with
 * `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";
import type { Plan, Result } from "./adminAnalytics";

export type RiskReason =
  | "suspended"
  | "trial_expired"
  | "trial_ending"
  | "dormant"
  | "never_sold";

export type RiskSeverity = "danger" | "warning";

export interface RiskTenant {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  status: string;
  ownerName: string | null;
  ownerEmail: string | null;
  reason: RiskReason;
  severity: RiskSeverity;
  daysSinceActivity: number | null;
  daysToTrialEnd: number | null;
}

const NETWORK_ERR = {
  ok: false as const,
  error: "Could not reach the server. Check your connection.",
};

export async function getAtRiskTenants(): Promise<Result<{ tenants: RiskTenant[] }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/at-risk`, {
      credentials: "include",
    });
    return (await res.json()) as Result<{ tenants: RiskTenant[] }>;
  } catch {
    return NETWORK_ERR;
  }
}
