import { pool, query } from "../db.js";
import { getPaymentQrMap } from "../merchant/paymentQr.repository.js";
import { notifyLowStock, type LowStockHit } from "../notifications/notifications.repository.js";
import type {
  Catalog,
  CashierProfile,
  CatalogCategory,
  CatalogProduct,
  OrderInput,
  PaymentMethod,
  Sale,
} from "./pos.schema.js";

/** VAT is 12% and PRICE-INCLUSIVE in PH retail, so vat = total × 12/112. */
const VAT_NUM = 12;
const VAT_DEN = 112;

// ── Catalog ──────────────────────────────────────────────────────────────

interface CatalogRow {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  sku: string | null;
  price_cents: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
}

/**
 * The live register feed for one Tenant: active products only, joined to their
 * category, plus the store name for the lock bar. Strictly scoped to
 * `tenantId` (read from the verified session, never the request).
 */
export async function getCatalog(tenantId: string): Promise<Catalog> {
  const store = await query<{ name: string; slug: string | null }>(
    `SELECT name, slug FROM tenants WHERE id = $1`,
    [tenantId],
  );

  const cats = await query<CatalogCategory>(
    `SELECT id, name FROM categories WHERE tenant_id = $1 ORDER BY sort_order ASC, lower(name) ASC`,
    [tenantId],
  );

  const prods = await query<CatalogRow>(
    `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.sku,
            p.price_cents, p.stock, p.low_stock_threshold, p.image_url
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.tenant_id = $1 AND p.is_active = TRUE
      ORDER BY p.name ASC`,
    [tenantId],
  );

  const paymentQrs = await getPaymentQrMap(tenantId);

  const products: CatalogProduct[] = prods.rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name,
    name: r.name,
    sku: r.sku,
    priceCents: r.price_cents,
    stock: r.stock,
    lowStockThreshold: r.low_stock_threshold,
    imageUrl: r.image_url,
  }));

  return {
    store: { name: store.rows[0]?.name ?? "Store", slug: store.rows[0]?.slug ?? null },
    categories: cats.rows,
    products,
    paymentQrs,
  };
}

/**
 * Cashier profiles for the terminal switch selector — CASHIER accounts in this
 * Tenant that have a PIN set. Names only; the PIN hash never leaves the DB.
 */
export async function listCashiers(tenantId: string): Promise<CashierProfile[]> {
  const { rows } = await query<CashierProfile>(
    `SELECT id, name
       FROM users
      WHERE tenant_id = $1 AND role = 'CASHIER' AND status = 'active' AND pin_hash IS NOT NULL
      ORDER BY lower(name) ASC`,
    [tenantId],
  );
  return rows;
}

// ── Checkout (ACID) ───────────────────────────────────────────────────────

export type OrderError =
  | { code: "UNAVAILABLE"; productId: string }
  | { code: "OUT_OF_STOCK"; productId: string; name: string; available: number }
  | { code: "INSUFFICIENT_CASH"; totalCents: number };

export type OrderResult = { ok: true; sale: Sale } | { ok: false; error: OrderError };

/**
 * Commit a checkout atomically.
 *   BEGIN
 *   → for each line: lock the product row (FOR UPDATE) and verify stock
 *   → if any line is short, ROLLBACK and report the offending product
 *   → decrement stock, write the `sales` header + `sale_items`, COMMIT.
 * The row locks serialize concurrent tills so the same unit can't be oversold.
 */
export async function createOrder(
  tenantId: string,
  cashierUserId: string | null,
  input: OrderInput,
  shiftId: string | null = null,
): Promise<OrderResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Merge any duplicate productIds so locks/decrements are applied once.
    const wanted = new Map<string, number>();
    for (const it of input.items) {
      wanted.set(it.productId, (wanted.get(it.productId) ?? 0) + it.qty);
    }

    const resolved: { id: string; name: string; unit: number; qty: number; lineTotal: number }[] = [];
    let totalCents = 0;

    for (const [productId, qty] of wanted) {
      const r = await client.query<{ id: string; name: string; price_cents: number; stock: number }>(
        `SELECT id, name, price_cents, stock
           FROM products
          WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
          FOR UPDATE`,
        [productId, tenantId],
      );
      const row = r.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "UNAVAILABLE", productId } };
      }
      if (row.stock < qty) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          error: { code: "OUT_OF_STOCK", productId: row.id, name: row.name, available: row.stock },
        };
      }
      const lineTotal = row.price_cents * qty;
      totalCents += lineTotal;
      resolved.push({ id: row.id, name: row.name, unit: row.price_cents, qty, lineTotal });
    }

    // Apply a cart-level discount (server-authoritative). `percent` clamps to
    // 0–100; `fixed` is centavos, never below zero net.
    const grossCents = totalCents;
    let discountCents = 0;
    let discountLabel: string | null = null;
    if (input.discount) {
      if (input.discount.type === "percent") {
        const pct = Math.min(100, Math.max(0, input.discount.value));
        discountCents = Math.round((grossCents * pct) / 100);
      } else {
        discountCents = Math.min(grossCents, Math.round(input.discount.value));
      }
      discountLabel = input.discount.label?.trim() || null;
    }
    const netCents = Math.max(0, grossCents - discountCents);

    // Cash settlement must cover the net total.
    let tenderedCents: number | null = null;
    let changeCents: number | null = null;
    if (input.paymentMethod === "Cash") {
      const tendered = input.tenderedCents ?? 0;
      if (tendered < netCents) {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "INSUFFICIENT_CASH", totalCents: netCents } };
      }
      tenderedCents = tendered;
      changeCents = tendered - netCents;
    }

    // Decrement stock under the held locks, capturing any product that lands
    // at/below its low-stock floor so the owner can be notified post-commit.
    const lowStockHits: LowStockHit[] = [];
    for (const it of resolved) {
      const dec = await client.query<{ name: string; stock: number; low_stock_threshold: number }>(
        `UPDATE products SET stock = stock - $1, updated_at = now()
          WHERE id = $2
        RETURNING name, stock, low_stock_threshold`,
        [it.qty, it.id],
      );
      const row = dec.rows[0];
      if (row && row.low_stock_threshold > 0 && row.stock <= row.low_stock_threshold) {
        lowStockHits.push({ id: it.id, name: row.name, stock: row.stock, threshold: row.low_stock_threshold });
      }
    }

    const vatCents = Math.round((netCents * VAT_NUM) / VAT_DEN);
    const subtotalCents = netCents - vatCents;

    // Serialized BIR-style invoice reference (per Tenant). The per-tenant
    // counter row is locked by this upsert for the rest of the transaction, so
    // two simultaneous tills can no longer land on the same sequence — each
    // committed receipt gets an immutable, gap-free, chronological number. The
    // counter is seeded from the Tenant's existing sales count on first use, so
    // numbering continues unbroken for stores that already have history. The
    // unique index on (tenant_id, reference) remains as a final backstop.
    const seqRes = await client.query<{ next_seq: string }>(
      `INSERT INTO invoice_counters (tenant_id, next_seq)
       VALUES ($1, (SELECT count(*) FROM sales WHERE tenant_id = $1) + 1)
       ON CONFLICT (tenant_id)
         DO UPDATE SET next_seq = invoice_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    // The serial prefix is owner-configurable (Account → Receipt). Default "SI"
    // when unset. Changing it never affects the gap-free sequence: the counter
    // keeps incrementing and uniqueness is scoped to (tenant_id, reference).
    const prefixRes = await client.query<{ invoice_prefix: string | null }>(
      `SELECT invoice_prefix FROM tenants WHERE id = $1`,
      [tenantId],
    );
    const prefix = prefixRes.rows[0]?.invoice_prefix?.trim() || "SI";
    const reference = `${prefix}-${String(Number(seqRes.rows[0].next_seq)).padStart(6, "0")}`;

    // Only link a customer that genuinely belongs to this Tenant (a tampered
    // client can't attach a sale to another store's customer).
    let customerId: string | null = null;
    if (input.customerId) {
      const owns = await client.query(
        `SELECT 1 FROM customers WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [input.customerId, tenantId],
      );
      if ((owns.rowCount ?? 0) > 0) customerId = input.customerId;
    }

    const saleRes = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO sales
         (tenant_id, cashier_user_id, reference, subtotal_cents, vat_cents, total_cents,
          payment_method, tendered_cents, change_cents, payment_ref, discount_cents, discount_label,
          shift_id, customer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, created_at`,
      [
        tenantId,
        cashierUserId,
        reference,
        subtotalCents,
        vatCents,
        netCents,
        input.paymentMethod,
        tenderedCents,
        changeCents,
        input.referenceCode ?? null,
        discountCents,
        discountLabel,
        shiftId,
        customerId,
      ],
    );
    const saleId = saleRes.rows[0].id;

    for (const it of resolved) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [saleId, it.id, it.name, it.unit, it.qty, it.lineTotal],
      );
    }

    // Loyalty: 1 point per ₱100 of net sale, accrued in the same transaction.
    if (customerId) {
      const points = Math.floor(netCents / 10_000);
      if (points > 0) {
        await client.query(
          `UPDATE customers SET loyalty_points = loyalty_points + $1, updated_at = now()
            WHERE id = $2 AND tenant_id = $3`,
          [points, customerId, tenantId],
        );
      }
    }

    await client.query("COMMIT");
    // Best-effort, fire-and-forget: never let a notification delay the receipt.
    void notifyLowStock(tenantId, lowStockHits);
    return {
      ok: true,
      sale: {
        id: saleId,
        reference,
        subtotalCents,
        vatCents,
        grossCents,
        discountCents,
        discountLabel,
        totalCents: netCents,
        paymentMethod: input.paymentMethod as PaymentMethod,
        paymentRef: input.referenceCode ?? null,
        tenderedCents,
        changeCents,
        createdAt: saleRes.rows[0].created_at.toISOString(),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
