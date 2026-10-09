/**
 * Client for the Super Admin audit trail (`/api/v1/admin/audit`). SUPER_ADMIN-only
 * server-side; the session cookie rides along with `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";
import type { Result } from "./adminAnalytics";

export type AuditAction =
  | "tenant_plan_change"
  | "tenant_status_change"
  | "broadcast"
  | "profile_update"
  | "owner_password_reset"
  | "onboarding_resend"
  | "shift_force_close"
  | "lead_edit"
  | "lead_delete";

export interface AuditRow {
  id: string;
  actorName: string;
  action: AuditAction;
  targetTenantId: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}

export async function getAuditTrail(): Promise<Result<{ entries: AuditRow[] }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/audit`, {
      credentials: "include",
    });
    return (await res.json()) as Result<{ entries: AuditRow[] }>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}
