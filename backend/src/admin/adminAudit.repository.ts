import { query } from "../db.js";

/**
 * The Super-Admin audit trail — data access for the platform control-plane
 * ledger (see the \`admin_audit_logs\` table in migrate.ts). \`recordAudit\` is the
 * single write seam every privileged action calls; it is best-effort and
 * swallows its own errors so an audit hiccup can never fail the action it
 * records (a plan change must still succeed even if the log insert does not).
 */

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

export interface AuditEntry {
  actorUserId: string;
  actorName: string;
  action: AuditAction;
  targetTenantId?: string | null;
  targetName?: string | null;
  detail?: string | null;
}

export interface AuditRow {
  id: string;
  actorName: string;
  action: AuditAction;
  targetTenantId: string | null;
  targetName: string | null;
  detail: string | null;
  createdAt: string;
}

/** Append one audit row. Best-effort: logs and returns on failure, never throws. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO admin_audit_logs
         (actor_user_id, actor_name, action, target_tenant_id, target_name, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.actorUserId,
        entry.actorName,
        entry.action,
        entry.targetTenantId ?? null,
        entry.targetName ?? null,
        entry.detail ?? null,
      ],
    );
  } catch (err) {
    console.error("[admin/audit] record failed:", err);
  }
}

/** The most recent control-plane actions, newest first (capped). */
export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const { rows } = await query<{
    id: string;
    actor_name: string;
    action: AuditAction;
    target_tenant_id: string | null;
    target_name: string | null;
    detail: string | null;
    created_at: Date;
  }>(
    `SELECT id, actor_name, action, target_tenant_id, target_name, detail, created_at
       FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actor_name,
    action: r.action,
    targetTenantId: r.target_tenant_id,
    targetName: r.target_name,
    detail: r.detail,
    createdAt: r.created_at.toISOString(),
  }));
}
