import { query } from "../db.js";
import { getSaleDetail } from "../pos/refunds.repository.js";
import type { SaleDetail } from "../pos/refunds.schema.js";

/**
 * The owner's Sales ledger — every forward sale (`kind = 'sale'`) the store's
 * registers rang up, filterable by date, status, payment method, cashier and
 * reference, plus a rollup over the SAME filtered set. Read-only: voids and
 * returns are still processed at the till; here they only show up as the
 * sale's status and as refunds netted out of the totals.
 *
 * Dates are Manila calendar days. Tenant scope comes from the caller (the
 * verified session), never from the request.
 */

const MNL = "Asia/Manila";

export const SALE_STATUSES = ["completed", "voided", "partially_returned", "returned"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];
export const PAYMENT_METHODS = ["Cash", "GCash", "Maya", "QRPH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface SalesFilter {
  from?: string;
  to?: string;
  status?: SaleStatus;
  paymentMethod?: PaymentMethod;
  cashierId?: string;
  /** Reference search (case-insensitive substring), e.g. "000123". */
  q?: string;
}

export interface SalesLedgerRow {
  id: string;
  reference: string;
  status: SaleStatus;
  totalCents: number;
  discountCents: number;
  vatCents: number;
  paymentMethod: string;
  cashierName: string | null;
  customerName: string | null;
  /** Units rung up on the sale (sum of line quantities). */
  itemsCount: number;
  /** Distinct lines on the sale. */
  lineCount: number;
  /** Up to three item names, for the row preview. */
  itemNames: string[];
  /** Money already given back on this sale (positive centavos). */
  refundedCents: number;
  createdAt: string;
}

export interface SalesLedgerSummary {
  txns: number;
  /** Sum of sale totals before refunds. */
  grossCents: number;
  /** Voids + returns against those sales (positive centavos). */
  refundedCents: number;
  /** gross − refunded. */
  netCents: number;
  itemsSold: number;
  discountCents: number;
  vatCents: number;
  /** Average ticket (gross ÷ txns). */
  avgCents: number;
  byMethod: { method: string; txns: number; totalCents: number }[];
}

export interface SalesLedgerPage {
  items: SalesLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: SalesLedgerSummary;
  cashiers: { userId: string; name: string }[];
}

/** Build the shared WHERE clause for the list and its rollup. */
function whereFor(tenantId: string, f: SalesFilter): { sql: string; vals: unknown[] } {
  const where = ["s.tenant_id = $1", "s.kind = 'sale'"];
  const vals: unknown[] = [tenantId];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replaceAll("?", `$${vals.length}`));
  };
  if (f.from) add(`s.created_at >= (?::date::timestamp AT TIME ZONE '${MNL}')`, f.from);
  if (f.to) add(`s.created_at < (((?::date + 1)::timestamp) AT TIME ZONE '${MNL}')`, f.to);
  if (f.status) add("s.status = ?", f.status);
  if (f.paymentMethod) add("s.payment_method = ?", f.paymentMethod);
  if (f.cashierId) add("s.cashier_user_id = ?", f.cashierId);
  if (f.q) add("s.reference ILIKE ?", `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  return { sql: where.join(" AND "), vals };
}

export async function listSalesLedger(
  tenantId: string,
  filter: SalesFilter,
  paging: { page: number; pageSize: number; offset: number },
): Promise<SalesLedgerPage> {
  const { sql: where, vals } = whereFor(tenantId, filter);
  const n = vals.length;

  const [rows, agg, methods, cashiers] = await Promise.all([
    query<{
      id: string;
      reference: string;
      status: SaleStatus;
      total_cents: number;
      discount_cents: number;
      vat_cents: number;
      payment_method: string;
      cashier_name: string | null;
      customer_name: string | null;
      items_count: string;
      line_count: number;
      item_names: string[] | null;
      refunded: string;
      created_at: Date;
    }>(
      `SELECT s.id, s.reference, s.status, s.total_cents, s.discount_cents, s.vat_cents,
              s.payment_method, u.name AS cashier_name, c.name AS customer_name, s.created_at,
              coalesce(li.items_count, 0) AS items_count,
              coalesce(li.line_count, 0)::int AS line_count,
              li.item_names,
              coalesce(rv.refunded, 0) AS refunded
         FROM sales s
         LEFT JOIN users u     ON u.id = s.cashier_user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN LATERAL (
           SELECT sum(i.qty) AS items_count, count(*) AS line_count,
                  (array_agg(i.name ORDER BY i.line_total_cents DESC, i.name))[1:3] AS item_names
             FROM sale_items i WHERE i.sale_id = s.id
         ) li ON TRUE
         LEFT JOIN LATERAL (
           SELECT -sum(r.total_cents) AS refunded
             FROM sales r WHERE r.reverses_sale_id = s.id AND r.tenant_id = s.tenant_id
         ) rv ON TRUE
        WHERE ${where}
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...vals, paging.pageSize, paging.offset],
    ),
    query<{
      txns: number;
      gross: string;
      discount: string;
      vat: string;
      items: string;
      refunded: string;
    }>(
      `SELECT count(*)::int                                   AS txns,
              coalesce(sum(s.total_cents), 0)::bigint         AS gross,
              coalesce(sum(s.discount_cents), 0)::bigint      AS discount,
              coalesce(sum(s.vat_cents), 0)::bigint           AS vat,
              coalesce(sum(li.items), 0)::bigint              AS items,
              coalesce(sum(rv.refunded), 0)::bigint           AS refunded
         FROM sales s
         LEFT JOIN LATERAL (SELECT sum(i.qty) AS items FROM sale_items i WHERE i.sale_id = s.id) li ON TRUE
         LEFT JOIN LATERAL (
           SELECT -sum(r.total_cents) AS refunded
             FROM sales r WHERE r.reverses_sale_id = s.id AND r.tenant_id = s.tenant_id
         ) rv ON TRUE
        WHERE ${where}`,
      vals,
    ),
    query<{ method: string; txns: number; total: string }>(
      `SELECT s.payment_method AS method, count(*)::int AS txns, coalesce(sum(s.total_cents), 0)::bigint AS total
         FROM sales s WHERE ${where}
        GROUP BY s.payment_method ORDER BY total DESC`,
      vals,
    ),
    // Everyone who has rung up a sale here, for the cashier filter.
    query<{ user_id: string; name: string }>(
      `SELECT DISTINCT u.id AS user_id, u.name
         FROM sales s JOIN users u ON u.id = s.cashier_user_id
        WHERE s.tenant_id = $1 AND s.kind = 'sale'
        ORDER BY u.name`,
      [tenantId],
    ),
  ]);

  const a = agg.rows[0];
  const grossCents = Number(a.gross);
  const refundedCents = Number(a.refunded);
  return {
    items: rows.rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      totalCents: r.total_cents,
      discountCents: r.discount_cents,
      vatCents: r.vat_cents,
      paymentMethod: r.payment_method,
      cashierName: r.cashier_name,
      customerName: r.customer_name,
      itemsCount: Number(r.items_count),
      lineCount: r.line_count,
      itemNames: r.item_names ?? [],
      refundedCents: Number(r.refunded),
      createdAt: r.created_at.toISOString(),
    })),
    total: a.txns,
    page: paging.page,
    pageSize: paging.pageSize,
    summary: {
      txns: a.txns,
      grossCents,
      refundedCents,
      netCents: grossCents - refundedCents,
      itemsSold: Number(a.items),
      discountCents: Number(a.discount),
      vatCents: Number(a.vat),
      avgCents: a.txns > 0 ? Math.round(grossCents / a.txns) : 0,
      byMethod: methods.rows.map((m) => ({ method: m.method, txns: m.txns, totalCents: Number(m.total) })),
    },
    cashiers: cashiers.rows.map((c) => ({ userId: c.user_id, name: c.name })),
  };
}

/** A void/return booked against a sale, as shown on the sale's record. */
export interface SaleReversalLine {
  id: string;
  reference: string;
  kind: "void" | "return";
  amountCents: number;
  reason: string | null;
  processedBy: string | null;
  createdAt: string;
}

/** The full record behind one ledger row — the receipt plus its after-life. */
export interface SaleRecord extends SaleDetail {
  scPwdType: "senior" | "pwd" | null;
  pointsEarned: number;
  pointsRedeemed: number;
  reversals: SaleReversalLine[];
}

export async function getSaleRecord(tenantId: string, saleId: string): Promise<SaleRecord | null> {
  const detail = await getSaleDetail(tenantId, saleId);
  if (!detail) return null;
  const [extra, reversals] = await Promise.all([
    query<{ sc_pwd_type: SaleRecord["scPwdType"]; points_earned: number; points_redeemed: number }>(
      `SELECT sc_pwd_type, points_earned, points_redeemed FROM sales WHERE id = $1 AND tenant_id = $2`,
      [saleId, tenantId],
    ),
    query<{
      id: string;
      reference: string;
      kind: "void" | "return";
      total_cents: number;
      reversal_reason: string | null;
      processed_by: string | null;
      created_at: Date;
    }>(
      `SELECT r.id, r.reference, r.kind, r.total_cents, r.reversal_reason,
              u.name AS processed_by, r.created_at
         FROM sales r
         LEFT JOIN users u ON u.id = r.cashier_user_id
        WHERE r.reverses_sale_id = $1 AND r.tenant_id = $2
        ORDER BY r.created_at ASC`,
      [saleId, tenantId],
    ),
  ]);
  const e = extra.rows[0];
  return {
    ...detail,
    scPwdType: e?.sc_pwd_type ?? null,
    pointsEarned: e?.points_earned ?? 0,
    pointsRedeemed: e?.points_redeemed ?? 0,
    reversals: reversals.rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      kind: r.kind,
      amountCents: -r.total_cents,
      reason: r.reversal_reason,
      processedBy: r.processed_by,
      createdAt: r.created_at.toISOString(),
    })),
  };
}
