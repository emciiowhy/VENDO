import type pg from "pg";
import { query } from "../db.js";
import type { Promotion } from "../pos/pos.schema.js";
import type { PromotionInput } from "./crm.schema.js";

/**
 * Owner-defined promotions (CRM → Discounts). Every query is scoped by
 * `tenantId` from the verified session, so one store can never read, apply or
 * edit another store's promo.
 */

export interface PromotionRow extends Promotion {
  isActive: boolean;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  is_active: boolean;
  created_at: Date;
}

const toPromotion = (r: Row): PromotionRow => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  value: r.value,
  isActive: r.is_active,
  createdAt: r.created_at.toISOString(),
});

const COLS = "id, name, kind, value, is_active, created_at";

/** Every promo (active and paused) for the owner's console. */
export async function listPromotions(tenantId: string): Promise<PromotionRow[]> {
  const { rows } = await query<Row>(
    `SELECT ${COLS} FROM promotions WHERE tenant_id = $1 ORDER BY is_active DESC, lower(name) ASC`,
    [tenantId],
  );
  return rows.map(toPromotion);
}

/** Only the ACTIVE promos — the tap-only buttons the till shows. */
export async function listActivePromotions(tenantId: string): Promise<Promotion[]> {
  const { rows } = await query<Row>(
    `SELECT ${COLS} FROM promotions WHERE tenant_id = $1 AND is_active ORDER BY lower(name) ASC`,
    [tenantId],
  );
  return rows.map(({ id, name, kind, value }) => ({ id, name, kind, value }));
}

/**
 * The active promo a checkout asked for, read inside the checkout transaction.
 * Null when it doesn't exist, belongs to another tenant, or was paused — the
 * till can only ever apply what the owner has switched on.
 */
export async function getActivePromotion(
  client: pg.PoolClient,
  tenantId: string,
  promoId: string,
): Promise<Promotion | null> {
  const { rows } = await client.query<Row>(
    `SELECT ${COLS} FROM promotions WHERE id = $1 AND tenant_id = $2 AND is_active`,
    [promoId, tenantId],
  );
  const r = rows[0];
  return r ? { id: r.id, name: r.name, kind: r.kind, value: r.value } : null;
}

export async function createPromotion(tenantId: string, input: PromotionInput): Promise<PromotionRow> {
  const { rows } = await query<Row>(
    `INSERT INTO promotions (tenant_id, name, kind, value, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLS}`,
    [tenantId, input.name, input.kind, input.value, input.isActive],
  );
  return toPromotion(rows[0]);
}

export async function updatePromotion(
  tenantId: string,
  id: string,
  input: PromotionInput,
): Promise<PromotionRow | null> {
  const { rows } = await query<Row>(
    `UPDATE promotions
        SET name = $3, kind = $4, value = $5, is_active = $6, updated_at = now()
      WHERE id = $1 AND tenant_id = $2
      RETURNING ${COLS}`,
    [id, tenantId, input.name, input.kind, input.value, input.isActive],
  );
  return rows[0] ? toPromotion(rows[0]) : null;
}

/** Hard delete is safe: past sales keep the promo's name in discount_label. */
export async function deletePromotion(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM promotions WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return (rowCount ?? 0) > 0;
}
