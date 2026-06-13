import type { PoolClient } from "pg";
import { query } from "../db.js";

/**
 * The one place stock ever moves. Every checkout, PO receive, production run and
 * manual edit routes through `moveStock` so the `products.stock` cache and the
 * immutable `stock_movements` ledger can never disagree.
 *
 * Contract: call this INSIDE an open transaction (the caller owns BEGIN/COMMIT).
 * The function locks the product row `FOR UPDATE`, so a read-modify-write is
 * race-free even when two tills, a PO receive and a production run touch the
 * same product at once. It returns the new on-hand, or a typed error the caller
 * turns into its own domain response and ROLLBACKs on.
 */

export type StockReason =
  | "sale"
  | "sale_void"
  | "return"
  | "po_receive"
  | "produce_consume"
  | "produce_output"
  | "adjust"
  | "count";

export interface MoveStockInput {
  tenantId: string;
  productId: string;
  /** Signed: negative consumes stock, positive adds it. */
  qtyDelta: number;
  reason: StockReason;
  /** Source entity that caused the move, for traceback (nullable for adjusts). */
  refTable?: "sales" | "purchase_orders" | "production_runs" | null;
  refId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export type MoveStockResult =
  | { ok: true; balanceAfter: number }
  | { ok: false; code: "GONE" }                       // product missing / not this tenant
  | { ok: false; code: "NEGATIVE"; available: number }; // move would drive stock below zero

/**
 * Lock the product, apply a signed delta, write the journal row. The
 * `balance_after` is captured under the same lock so the ledger reads as a true
 * running statement. A zero delta is a no-op that still reports the current
 * on-hand (callers can pass it without special-casing).
 */
export async function moveStock(
  client: PoolClient,
  input: MoveStockInput,
): Promise<MoveStockResult> {
  const lock = await client.query<{ stock: number }>(
    `SELECT stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [input.productId, input.tenantId],
  );
  const row = lock.rows[0];
  if (!row) return { ok: false, code: "GONE" };

  const balanceAfter = row.stock + input.qtyDelta;
  if (balanceAfter < 0) return { ok: false, code: "NEGATIVE", available: row.stock };

  if (input.qtyDelta !== 0) {
    await client.query(
      `UPDATE products SET stock = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [balanceAfter, input.productId, input.tenantId],
    );
  }

  await client.query(
    `INSERT INTO stock_movements
       (tenant_id, product_id, qty_delta, balance_after, reason, ref_table, ref_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      input.tenantId,
      input.productId,
      input.qtyDelta,
      balanceAfter,
      input.reason,
      input.refTable ?? null,
      input.refId ?? null,
      input.note ?? null,
      input.createdBy ?? null,
    ],
  );

  return { ok: true, balanceAfter };
}

// ── Read side ───────────────────────────────────────────────────────────────

export interface StockMovement {
  id: string;
  productId: string;
  productName: string | null;
  qtyDelta: number;
  balanceAfter: number;
  reason: StockReason;
  refTable: string | null;
  refId: string | null;
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface MovementRow {
  id: string;
  product_id: string;
  product_name: string | null;
  qty_delta: number;
  balance_after: number;
  reason: StockReason;
  ref_table: string | null;
  ref_id: string | null;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}

function toMovement(r: MovementRow): StockMovement {
  return {
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    qtyDelta: r.qty_delta,
    balanceAfter: r.balance_after,
    reason: r.reason,
    refTable: r.ref_table,
    refId: r.ref_id,
    note: r.note,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at.toISOString(),
  };
}

const MOVEMENT_COLUMNS = `m.id, m.product_id, p.name AS product_name, m.qty_delta,
  m.balance_after, m.reason, m.ref_table, m.ref_id, m.note, m.created_by,
  u.name AS created_by_name, m.created_at`;

/** The movement history for one product (newest first), tenant-fenced. */
export async function listProductMovements(
  tenantId: string,
  productId: string,
  limit = 100,
): Promise<StockMovement[]> {
  const { rows } = await query<MovementRow>(
    `SELECT ${MOVEMENT_COLUMNS}
       FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id
       LEFT JOIN users u    ON u.id = m.created_by
      WHERE m.tenant_id = $1 AND m.product_id = $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3`,
    [tenantId, productId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(toMovement);
}

/** The whole-store movement feed (optionally filtered by reason), newest first. */
export async function listMovements(
  tenantId: string,
  opts: { reason?: StockReason; limit?: number } = {},
): Promise<StockMovement[]> {
  const params: unknown[] = [tenantId];
  let where = `m.tenant_id = $1`;
  if (opts.reason) {
    params.push(opts.reason);
    where += ` AND m.reason = $${params.length}`;
  }
  params.push(Math.min(Math.max(opts.limit ?? 200, 1), 500));
  const { rows } = await query<MovementRow>(
    `SELECT ${MOVEMENT_COLUMNS}
       FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id
       LEFT JOIN users u    ON u.id = m.created_by
      WHERE ${where}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map(toMovement);
}

/**
 * Integrity check: products whose cached `stock` disagrees with the SUM of their
 * ledger deltas. An empty result means the ledger and the on-hand cache are in
 * lockstep; any row is a drift bug worth surfacing (e.g. in the admin health
 * panel). Tenant-fenced.
 */
export async function findLedgerDrift(
  tenantId: string,
): Promise<{ productId: string; name: string; cachedStock: number; ledgerStock: number }[]> {
  const { rows } = await query<{
    product_id: string;
    name: string;
    cached_stock: number;
    ledger_stock: string;
  }>(
    `SELECT p.id AS product_id, p.name, p.stock AS cached_stock,
            COALESCE(SUM(m.qty_delta), 0) AS ledger_stock
       FROM products p
       LEFT JOIN stock_movements m ON m.product_id = p.id
      WHERE p.tenant_id = $1
      GROUP BY p.id, p.name, p.stock
     HAVING p.stock <> COALESCE(SUM(m.qty_delta), 0)
      ORDER BY p.name ASC`,
    [tenantId],
  );
  return rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    cachedStock: r.cached_stock,
    ledgerStock: Number(r.ledger_stock),
  }));
}

export { toMovement };
export type { MovementRow };
