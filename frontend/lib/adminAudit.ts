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

/** One page of the platform audit trail, newest first. */
export async function getAuditTrail(
  page = 1,
  pageSize = 25,
): Promise<Result<{ entries: AuditRow[]; total: number; page: number; pageSize: number }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/admin/audit?page=${page}&pageSize=${pageSize}`, {
      credentials: "include",
    });
    return (await res.json()) as Result<{ entries: AuditRow[]; total: number; page: number; pageSize: number }>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}
