import { pool, query } from "../db.js";
import { hashPin } from "../auth/auth.crypto.js";
import { notifyPinRequest } from "../notifications/notifications.repository.js";

/**
 * Staff & cashier-PIN administration data access. Every query is fenced to a
 * `tenantId` (from the verified session, or — for the public forgot-PIN seam —
 * a Store ID the caller already resolved to a tenant). Cashiers never set their
 * own PINs: a forgotten PIN raises a request that the OWNER resolves.
 */

/** A cashier's live open shift, surfaced in the owner roster (null if off the till). */
export interface CashierShiftBrief {
  id: string;
  openedAt: string;
  openingCents: number;
  /** opening float + cash sales so far — what the drawer should hold right now. */
  expectedCashCents: number;
}

export interface CashierSummary {
  id: string;
  name: string;
  status: string;
  hasPin: boolean;
  pendingRequest: boolean;
  /** Owner-set default opening float (centavos); 0 = none. */
  defaultFloatCents: number;
  /** The cashier's currently-open shift, or null. */
  shift: CashierShiftBrief | null;
}

export interface PinRequest {
  id: string;
  cashierUserId: string;
  cashierName: string;
  createdAt: string;
}

/** Active cashiers for a store (id + name only) — used by the forgot-PIN picker. */
export async function listActiveCashiers(tenantId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await query<{ id: string; name: string }>(
    `SELECT id, name FROM users
      WHERE tenant_id = $1 AND role = 'CASHIER' AND status = 'active'
      ORDER BY lower(name) ASC`,
    [tenantId],
  );
  return rows;
}

/**
 * Cashiers with PIN + request status, for the owner's staff console. Unlike the
 * forgot-PIN picker this includes DISABLED cashiers (active first) so the owner
 * can re-enable or remove them — the roster is the full management surface.
 */
export async function listCashierSummaries(tenantId: string): Promise<CashierSummary[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    status: string;
    has_pin: boolean;
    pending: boolean;
    default_float_cents: number;
    shift_id: string | null;
    shift_opening_cents: number | null;
    shift_opened_at: Date | null;
    shift_cash_cents: string | null;
  }>(
    `SELECT u.id, u.name, u.status, u.default_float_cents,
            (u.pin_hash IS NOT NULL) AS has_pin,
            EXISTS (
              SELECT 1 FROM cashier_pin_requests r
               WHERE r.cashier_user_id = u.id AND r.status = 'pending'
            ) AS pending,
            s.id            AS shift_id,
            s.opening_cents AS shift_opening_cents,
            s.opened_at     AS shift_opened_at,
            cs.cash         AS shift_cash_cents
       FROM users u
       LEFT JOIN cashier_shifts s
              ON s.cashier_user_id = u.id AND s.tenant_id = u.tenant_id AND s.status = 'open'
       LEFT JOIN LATERAL (
         SELECT coalesce(sum(total_cents), 0)::bigint AS cash
           FROM sales
          WHERE shift_id = s.id AND payment_method = 'Cash'
       ) cs ON TRUE
      WHERE u.tenant_id = $1 AND u.role = 'CASHIER'
      ORDER BY (u.status = 'active') DESC, lower(u.name) ASC`,
    [tenantId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    hasPin: r.has_pin,
    pendingRequest: r.pending,
    defaultFloatCents: r.default_float_cents,
    shift:
      r.shift_id && r.shift_opened_at
        ? {
            id: r.shift_id,
            openedAt: r.shift_opened_at.toISOString(),
            openingCents: r.shift_opening_cents ?? 0,
            expectedCashCents: (r.shift_opening_cents ?? 0) + Number(r.shift_cash_cents ?? 0),
          }
        : null,
  }));
}

/** A user's default opening float in centavos (0 when none set / not found). */
export async function getDefaultFloatCents(tenantId: string, userId: string): Promise<number> {
  const { rows } = await query<{ default_float_cents: number }>(
    `SELECT default_float_cents FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId],
  );
  return rows[0]?.default_float_cents ?? 0;
}

/**
 * Create a cashier under a tenant (owner self-service). Cashiers don't use
 * Google, but `users.email` is the global identity key, so we mint a synthetic
 * unique address (`gen_random_uuid()` guarantees the unique index never trips).
 * A PIN is optional at creation — the owner can set it now or later; without one
 * the cashier simply can't sign in yet. Returns the fresh roster summary.
 */
export async function createCashier(
  tenantId: string,
  name: string,
  pin?: string,
  defaultFloatCents = 0,
): Promise<CashierSummary> {
  const { rows } = await query<{
    id: string;
    name: string;
    status: string;
    has_pin: boolean;
    default_float_cents: number;
  }>(
    `INSERT INTO users (tenant_id, email, name, role, pin_hash, status, default_float_cents)
     VALUES ($1, 'cashier.' || gen_random_uuid() || '@cashier.local', $2, 'CASHIER', $3, 'active', $4)
     RETURNING id, name, status, default_float_cents, (pin_hash IS NOT NULL) AS has_pin`,
    [tenantId, name, pin ? hashPin(pin) : null, defaultFloatCents],
  );
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    hasPin: r.has_pin,
    pendingRequest: false,
    defaultFloatCents: r.default_float_cents,
    shift: null,
  };
}

/**
 * Update a cashier's editable fields (name and/or active|disabled status).
 * COALESCE leaves untouched any field the caller didn't send. Tenant-fenced and
 * role-fenced so an owner can never edit another store's user or a non-cashier.
 * A disabled cashier can't authenticate (the PIN/login lookups require active).
 * Returns false when no such cashier exists in this tenant.
 */
export async function updateCashier(
  tenantId: string,
  cashierUserId: string,
  fields: { name?: string; status?: "active" | "disabled"; defaultFloatCents?: number },
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE users
        SET name = COALESCE($3, name),
            status = COALESCE($4, status),
            default_float_cents = COALESCE($5, default_float_cents)
      WHERE id = $1 AND tenant_id = $2 AND role = 'CASHIER'`,
    [cashierUserId, tenantId, fields.name ?? null, fields.status ?? null, fields.defaultFloatCents ?? null],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Permanently remove a cashier profile. Past sales/shifts that referenced them
 * keep their data (those FKs are ON DELETE SET NULL); any pending PIN requests
 * cascade away. Tenant- and role-fenced. Returns false if not found here.
 */
export async function deleteCashier(tenantId: string, cashierUserId: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'CASHIER'`,
    [cashierUserId, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

/** Pending PIN-reset requests for a store, oldest first. */
export async function listPendingPinRequests(tenantId: string): Promise<PinRequest[]> {
  const { rows } = await query<{
    id: string;
    cashier_user_id: string;
    cashier_name: string;
    created_at: Date;
  }>(
    `SELECT id, cashier_user_id, cashier_name, created_at
       FROM cashier_pin_requests
      WHERE tenant_id = $1 AND status = 'pending'
      ORDER BY created_at ASC`,
    [tenantId],
  );
  return rows.map((r) => ({
    id: r.id,
    cashierUserId: r.cashier_user_id,
    cashierName: r.cashier_name,
    createdAt: r.created_at.toISOString(),
  }));
}

export type CreateRequestResult =
  | { ok: true; created: boolean }
  | { ok: false; error: "NOT_FOUND" };

/**
 * Raise a PIN-reset request for a cashier (public forgot-PIN seam). Verifies the
 * cashier belongs to the resolved tenant; idempotent — a second request while
 * one is still pending is a no-op (`created:false`), not a duplicate row.
 */
export async function createPinRequest(
  tenantId: string,
  cashierUserId: string,
): Promise<CreateRequestResult> {
  const cashier = await query<{ name: string }>(
    `SELECT name FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'CASHIER' AND status = 'active'`,
    [cashierUserId, tenantId],
  );
  if (!cashier.rows[0]) return { ok: false, error: "NOT_FOUND" };

  const cashierName = cashier.rows[0].name;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO cashier_pin_requests (tenant_id, cashier_user_id, cashier_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (cashier_user_id) WHERE status = 'pending' DO NOTHING
     RETURNING id`,
    [tenantId, cashierUserId, cashierName],
  );
  const created = rows.length > 0;
  // Notify the store's owners/managers that a reset is waiting (best-effort).
  if (created) void notifyPinRequest(tenantId, cashierName, rows[0].id);
  return { ok: true, created };
}

/**
 * Owner sets/replaces a cashier's PIN. In one transaction: update the hash and
 * mark any pending request for that cashier resolved. Returns false if the
 * cashier isn't in this tenant.
 */
export async function setCashierPin(
  tenantId: string,
  cashierUserId: string,
  pin: string,
  resolvedBy: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE users SET pin_hash = $3
        WHERE id = $1 AND tenant_id = $2 AND role = 'CASHIER' AND status = 'active'`,
      [cashierUserId, tenantId, hashPin(pin)],
    );
    if ((upd.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `UPDATE cashier_pin_requests
          SET status = 'resolved', resolved_at = now(), resolved_by = $3
        WHERE cashier_user_id = $1 AND tenant_id = $2 AND status = 'pending'`,
      [cashierUserId, tenantId, resolvedBy],
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Dismiss a pending PIN-reset request without changing the PIN. */
export async function rejectPinRequest(
  tenantId: string,
  requestId: string,
  resolvedBy: string,
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE cashier_pin_requests
        SET status = 'rejected', resolved_at = now(), resolved_by = $3
      WHERE id = $1 AND tenant_id = $2 AND status = 'pending'`,
    [requestId, tenantId, resolvedBy],
  );
  return (rowCount ?? 0) > 0;
}
