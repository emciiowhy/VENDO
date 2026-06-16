import { query } from "../db.js";
import type { AuditAction, AuditEventInput, AuditLog } from "./audit.js";

/**
 * Data access for the POS audit trail. Every query is scoped by `tenantId`
 * (read from the verified session, never the request body); the log is
 * append-only — there is no update or delete path, so the trail is immutable.
 * Money is integer centavos throughout.
 */

interface AuditRow {
  id: string;
  cashier_user_id: string | null;
  cashier_name: string;
  action: AuditAction;
  item_name: string | null;
  item_qty: number | null;
  value_cents: number;
  detail: string | null;
  created_at: Date;
}

function toLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name,
    action: row.action,
    itemName: row.item_name,
    itemQty: row.item_qty,
    valueCents: row.value_cents,
    detail: row.detail,
    createdAt: row.created_at.toISOString(),
  };
}

/** Append one audit event for a terminal action. Returns the persisted row. */
export async function recordAuditLog(
  tenantId: string,
  cashierUserId: string | null,
  cashierName: string,
  input: AuditEventInput,
): Promise<AuditLog> {
  const { rows } = await query<AuditRow>(
    `INSERT INTO pos_audit_logs
       (tenant_id, cashier_user_id, cashier_name, action, item_name, item_qty, value_cents, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, cashier_user_id, cashier_name, action, item_name, item_qty, value_cents, detail, created_at`,
    [
      tenantId,
      cashierUserId,
      cashierName,
      input.action,
      input.itemName ?? null,
      input.itemQty ?? null,
      input.valueCents ?? 0,
      input.detail ?? null,
    ],
  );
  return toLog(rows[0]);
}

/** Recent audit rows for this Tenant, newest first (owner review). */
export async function listAuditLogs(tenantId: string, limit = 100): Promise<AuditLog[]> {
  const { rows } = await query<AuditRow>(
    `SELECT id, cashier_user_id, cashier_name, action, item_name, item_qty, value_cents, detail, created_at
       FROM pos_audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(toLog);
}
