import { pool, query } from "../db.js";
import { moveStock } from "../inventory/stockLedger.js";
import { computeRefund } from "./refunds.schema.js";
import type {
  Reversal,
  SaleDetail,
  SaleLineDetail,
  SaleSummary,
} from "./refunds.schema.js";

// ── Read side (drives the void/return screen) ────────────────────────────────

/** Recent completed-or-reversed sales (kind='sale') for the picker, newest first. */
export async function listRecentSales(tenantId: string, limit = 50): Promise<SaleSummary[]> {
  const { rows } = await query<{
    id: string;
    reference: string;
    status: SaleDetail["status"];
    total_cents: number;
    payment_method: string;
    cashier_name: string | null;
    created_at: Date;
  }>(
    `SELECT s.id, s.reference, s.status, s.total_cents, s.payment_method,
            u.name AS cashier_name, s.created_at
       FROM sales s
       LEFT JOIN users u ON u.id = s.cashier_user_id
      WHERE s.tenant_id = $1 AND s.kind = 'sale'
      ORDER BY s.created_at DESC
      LIMIT $2`,
    [tenantId, Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    totalCents: r.total_cents,
    paymentMethod: r.payment_method,
    cashierName: r.cashier_name,
    createdAt: r.created_at.toISOString(),
  }));
}

/** One sale with per-line returnable quantities (sold − already returned). */
export async function getSaleDetail(tenantId: string, saleId: string): Promise<SaleDetail | null> {
  const head = await query<{
    id: string;
    reference: string;
    status: SaleDetail["status"];
    subtotal_cents: number;
    vat_cents: number;
    discount_cents: number;
    discount_label: string | null;
    total_cents: number;
    payment_method: string;
    payment_ref: string | null;
    tendered_cents: number | null;
    change_cents: number | null;
    cashier_name: string | null;
    customer_name: string | null;
    created_at: Date;
  }>(
    `SELECT s.id, s.reference, s.status, s.subtotal_cents, s.vat_cents, s.discount_cents,
            s.discount_label, s.total_cents, s.payment_method, s.payment_ref,
            s.tendered_cents, s.change_cents,
            u.name AS cashier_name, c.name AS customer_name, s.created_at
       FROM sales s
       LEFT JOIN users u     ON u.id = s.cashier_user_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1 AND s.tenant_id = $2 AND s.kind = 'sale'`,
    [saleId, tenantId],
  );
  if (!head.rows[0]) return null;
  const h = head.rows[0];

  // Each original line plus the sum of quantities already returned against it.
  const lines = await query<{
    sale_item_id: string;
    product_id: string | null;
    name: string;
    unit_price_cents: number;
    qty: number;
    returned_qty: string;
  }>(
    `SELECT oi.id AS sale_item_id, oi.product_id, oi.name, oi.unit_price_cents, oi.qty,
            COALESCE(-SUM(ri.qty), 0) AS returned_qty
       FROM sale_items oi
       LEFT JOIN sale_items ri ON ri.reverses_sale_item_id = oi.id
      WHERE oi.sale_id = $1
      GROUP BY oi.id, oi.product_id, oi.name, oi.unit_price_cents, oi.qty
      ORDER BY oi.name ASC`,
    [saleId],
  );

  const detailLines: SaleLineDetail[] = lines.rows.map((r) => {
    const returnedQty = Number(r.returned_qty);
    return {
      saleItemId: r.sale_item_id,
      productId: r.product_id,
      name: r.name,
      unitPriceCents: r.unit_price_cents,
      qty: r.qty,
      returnedQty,
      returnableQty: r.qty - returnedQty,
    };
  });

  return {
    id: h.id,
    reference: h.reference,
    status: h.status,
    subtotalCents: h.subtotal_cents,
    vatCents: h.vat_cents,
    discountCents: h.discount_cents,
    discountLabel: h.discount_label,
    grossCents: h.total_cents + h.discount_cents,
    totalCents: h.total_cents,
    paymentMethod: h.payment_method,
    paymentRef: h.payment_ref,
    tenderedCents: h.tendered_cents,
    changeCents: h.change_cents,
    cashierName: h.cashier_name,
    customerName: h.customer_name,
    createdAt: h.created_at.toISOString(),
    lines: detailLines,
  };
}

// ── Write side (the ACID reversal) ───────────────────────────────────────────

export type ReverseMode =
  | { kind: "void" }
  | { kind: "return"; lines: { saleItemId: string; qty: number }[] };

export type ReverseResult =
  | { ok: true; reversal: Reversal }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "NOT_REVERSIBLE" // already voided, or voiding a sale that has returns
        | "NOTHING_TO_RETURN"
        | "INVALID_LINE" // a requested line isn't on this sale
        | "OVER_RETURN"; // requested qty exceeds what remains returnable
      detail?: string;
    };

interface OrigItem {
  id: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  qty: number;
  returnedQty: number;
}

/**
 * Void or return a sale, atomically. Writes a negative contra `sales` row (+ its
 * negative `sale_items`), restores stock through the ledger, reverses any
 * loyalty, and stamps the original sale's new lifecycle status — all in one
 * transaction. The original sale row is locked for the duration so two clerks
 * can't double-refund the same units.
 *
 * Refund maths mirror checkout exactly: the returned items' gross is reduced by
 * their proportional share of the sale's cart discount, then VAT (12% inclusive)
 * is split out of the net so the books reverse the way they were booked.
 */
export async function reverseSale(
  tenantId: string,
  processorUserId: string | null,
  saleId: string,
  mode: ReverseMode,
  reason: string | null,
  shiftId: string | null,
): Promise<ReverseResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const saleRes = await client.query<{
      id: string;
      status: SaleDetail["status"];
      total_cents: number;
      discount_cents: number;
      payment_method: string;
      customer_id: string | null;
    }>(
      `SELECT id, status, total_cents, discount_cents, payment_method, customer_id
         FROM sales
        WHERE id = $1 AND tenant_id = $2 AND kind = 'sale'
        FOR UPDATE`,
      [saleId, tenantId],
    );
    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_FOUND" };
    }
    if (sale.status === "voided" || sale.status === "returned") {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_REVERSIBLE", detail: `Sale is already ${sale.status}.` };
    }
    // A void cancels the whole sale and only makes sense before any partial
    // return has split it; return the remaining lines instead.
    if (mode.kind === "void" && sale.status !== "completed") {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_REVERSIBLE", detail: "This sale already has returns; reverse the remaining lines as a return." };
    }

    // Original lines + how much of each has already gone back.
    const itemRes = await client.query<{
      id: string;
      product_id: string | null;
      name: string;
      unit_price_cents: number;
      qty: number;
      returned_qty: string;
    }>(
      `SELECT oi.id, oi.product_id, oi.name, oi.unit_price_cents, oi.qty,
              COALESCE(-SUM(ri.qty), 0) AS returned_qty
         FROM sale_items oi
         LEFT JOIN sale_items ri ON ri.reverses_sale_item_id = oi.id
        WHERE oi.sale_id = $1
        GROUP BY oi.id, oi.product_id, oi.name, oi.unit_price_cents, oi.qty`,
      [saleId],
    );
    const items: OrigItem[] = itemRes.rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      unitPriceCents: r.unit_price_cents,
      qty: r.qty,
      returnedQty: Number(r.returned_qty),
    }));
    const byId = new Map(items.map((it) => [it.id, it]));

    // Resolve the lines to reverse and the qty for each.
    const toReverse: { item: OrigItem; qty: number }[] = [];
    if (mode.kind === "void") {
      for (const it of items) {
        const remaining = it.qty - it.returnedQty;
        if (remaining > 0) toReverse.push({ item: it, qty: remaining });
      }
    } else {
      // Merge duplicate line ids so a doubled request can't over-draw.
      const wanted = new Map<string, number>();
      for (const l of mode.lines) wanted.set(l.saleItemId, (wanted.get(l.saleItemId) ?? 0) + l.qty);
      for (const [saleItemId, qty] of wanted) {
        const it = byId.get(saleItemId);
        if (!it) {
          await client.query("ROLLBACK");
          return { ok: false, code: "INVALID_LINE", detail: `Line ${saleItemId} is not on this sale.` };
        }
        const remaining = it.qty - it.returnedQty;
        if (qty > remaining) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            code: "OVER_RETURN",
            detail: `Only ${remaining} of “${it.name}” can still be returned.`,
          };
        }
        toReverse.push({ item: it, qty });
      }
    }

    if (toReverse.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOTHING_TO_RETURN" };
    }

    // Refund maths — mirror checkout. Discount is reversed pro-rata by gross.
    const returnedGross = toReverse.reduce((sum, l) => sum + l.item.unitPriceCents * l.qty, 0);
    const {
      discountShareCents: discountShare,
      refundNetCents: refundNet,
      refundVatCents: refundVat,
      refundSubtotalCents: refundSub,
    } = computeRefund({
      returnedGrossCents: returnedGross,
      originalTotalCents: sale.total_cents,
      originalDiscountCents: sale.discount_cents,
    });

    // Per-tenant reversal serial (locked-upsert, like the invoice serializer).
    const seqRes = await client.query<{ next_seq: string }>(
      `INSERT INTO reversal_counters (tenant_id, next_seq)
       VALUES ($1, 1)
       ON CONFLICT (tenant_id)
         DO UPDATE SET next_seq = reversal_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    const prefix = mode.kind === "void" ? "VD" : "RV";
    const reference = `${prefix}-${String(Number(seqRes.rows[0].next_seq)).padStart(6, "0")}`;

    // The contra sale: negative money, refunded down the original's channel.
    const contraRes = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO sales
         (tenant_id, cashier_user_id, reference, subtotal_cents, vat_cents, total_cents,
          payment_method, discount_cents, shift_id, customer_id, kind, reverses_sale_id, reversal_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, created_at`,
      [
        tenantId,
        processorUserId,
        reference,
        -refundSub,
        -refundVat,
        -refundNet,
        sale.payment_method,
        -discountShare,
        shiftId,
        sale.customer_id,
        mode.kind,
        saleId,
        reason,
      ],
    );
    const contraId = contraRes.rows[0].id;

    for (const l of toReverse) {
      await client.query(
        `INSERT INTO sale_items
           (sale_id, product_id, name, unit_price_cents, qty, line_total_cents, reverses_sale_item_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          contraId,
          l.item.productId,
          l.item.name,
          l.item.unitPriceCents,
          -l.qty,
          -(l.item.unitPriceCents * l.qty),
          l.item.id,
        ],
      );

      // Put the units back through the stock ledger. A line whose product was
      // since deleted (product_id null) has no stock to restore — skip it.
      if (l.item.productId) {
        const moved = await moveStock(client, {
          tenantId,
          productId: l.item.productId,
          qtyDelta: l.qty,
          reason: mode.kind === "void" ? "sale_void" : "return",
          refTable: "sales",
          refId: contraId,
          createdBy: processorUserId,
        });
        if (!moved.ok) throw new Error(`stock ledger refused reversal line ${l.item.id}: ${moved.code}`);
      }
    }

    // Reverse loyalty accrued on the original (1 pt / ₱100), clamped at zero. A
    // void unwinds the whole sale's points; a return unwinds the refunded share.
    if (sale.customer_id) {
      const basis = mode.kind === "void" ? sale.total_cents : refundNet;
      const pts = Math.floor(basis / 10_000);
      if (pts > 0) {
        await client.query(
          `UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points - $1), updated_at = now()
            WHERE id = $2 AND tenant_id = $3`,
          [pts, sale.customer_id, tenantId],
        );
      }
    }

    // New lifecycle status on the original: a void marks it voided; a return is
    // 'returned' once every line is fully back, else 'partially_returned'.
    let originalStatus: Reversal["originalStatus"];
    if (mode.kind === "void") {
      originalStatus = "voided";
    } else {
      const reversedNow = new Map<string, number>();
      for (const l of toReverse) reversedNow.set(l.item.id, l.qty);
      const fullyReturned = items.every(
        (it) => it.qty - it.returnedQty - (reversedNow.get(it.id) ?? 0) === 0,
      );
      originalStatus = fullyReturned ? "returned" : "partially_returned";
    }
    await client.query(`UPDATE sales SET status = $1 WHERE id = $2 AND tenant_id = $3`, [
      originalStatus,
      saleId,
      tenantId,
    ]);

    await client.query("COMMIT");
    return {
      ok: true,
      reversal: {
        id: contraId,
        reference,
        kind: mode.kind,
        subtotalCents: -refundSub,
        vatCents: -refundVat,
        discountCents: -discountShare,
        totalCents: -refundNet,
        paymentMethod: sale.payment_method,
        reason,
        createdAt: contraRes.rows[0].created_at.toISOString(),
        originalStatus,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
