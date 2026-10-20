import { query } from "../db.js";
import type { ActivityAction, ActivityEvent, AuditEventInput, AuditLog } from "./audit.js";

/**
 * Data access for the POS activity log. Every query is scoped by `tenantId`
 * (read from the verified session, never the request body); the log is
 * append-only — there is no update or delete path, so the trail is immutable.
 * Money is integer centavos throughout.
 */

interface AuditRow {
  id: string;
  cashier_user_id: string | null;
  cashier_name: string;
  action: ActivityAction;
  ref_id: string | null;
  item_name: string | null;
  item_qty: number | null;
  value_cents: number;
  detail: string | null;
  created_at: Date;
}

const COLS = "id, cashier_user_id, cashier_name, action, ref_id, item_name, item_qty, value_cents, detail, created_at";

function toLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    cashierUserId: row.cashier_user_id,
    cashierName: row.cashier_name,
    action: row.action,
    refId: row.ref_id,
    itemName: row.item_name,
    itemQty: row.item_qty,
    valueCents: row.value_cents,
    detail: row.detail,
    createdAt: row.created_at.toISOString(),
  };
}

/** Append one FLOOR event the register reported. Returns the persisted row. */
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
     RETURNING ${COLS}`,
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

/** Who performed a server-side action (from the verified session). */
export interface Actor {
  tenantId: string | null;
  userId: string | null;
  name: string;
}

/**
 * Append a SERVER event — called by the route that just did the work. Never
 * throws: the activity log must never fail a sale, sign-in or clock punch, so
 * an error is logged and swallowed. A platform user with no tenant is skipped.
 */
export async function logActivity(actor: Actor, event: ActivityEvent): Promise<void> {
  if (!actor.tenantId) return;
  try {
    await query(
      `INSERT INTO pos_audit_logs
         (tenant_id, cashier_user_id, cashier_name, action, ref_id, item_name, item_qty, value_cents, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actor.tenantId,
        actor.userId,
        actor.name || "Staff",
        event.action,
        event.refId ?? null,
        event.itemName ?? null,
        event.itemQty ?? null,
        Math.round(event.valueCents ?? 0),
        event.detail ?? null,
      ],
    );
  } catch (err) {
    console.error(`[activity] could not log ${event.action}:`, err);
  }
}

export interface ActivityFilter {
  action?: ActivityAction;
  userId?: string;
  /** Inclusive Manila dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
  limit?: number;
}

/** Activity for this Tenant, newest first, optionally filtered (owner review). */
export async function listAuditLogs(tenantId: string, filter: ActivityFilter = {}): Promise<AuditLog[]> {
  const where = ["tenant_id = $1"];
  const vals: unknown[] = [tenantId];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace("?", `$${vals.length}`));
  };
  if (filter.action) add("action = ?", filter.action);
  if (filter.userId) add("cashier_user_id = ?", filter.userId);
  if (filter.from) add("created_at >= (?::date::timestamp AT TIME ZONE 'Asia/Manila')", filter.from);
  if (filter.to) add("created_at < (((?::date + 1)::timestamp) AT TIME ZONE 'Asia/Manila')", filter.to);
  vals.push(Math.min(Math.max(filter.limit ?? 200, 1), 500));
  const { rows } = await query<AuditRow>(
    `SELECT ${COLS} FROM pos_audit_logs
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${vals.length}`,
    vals,
  );
  return rows.map(toLog);
}

/** Everyone who appears in this Tenant's log, for the "who" filter. */
export async function listActivityActors(tenantId: string): Promise<{ userId: string; name: string }[]> {
  const { rows } = await query<{ user_id: string; name: string }>(
    `SELECT DISTINCT ON (cashier_user_id) cashier_user_id AS user_id, cashier_name AS name
       FROM pos_audit_logs
      WHERE tenant_id = $1 AND cashier_user_id IS NOT NULL
      ORDER BY cashier_user_id, created_at DESC`,
    [tenantId],
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name));
}
