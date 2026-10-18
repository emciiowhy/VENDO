import { pool, query } from "../db.js";
import { moveStock } from "../inventory/stockLedger.js";
import { getPaymentQrMap } from "../merchant/paymentQr.repository.js";
import { notifyLowStock, type LowStockHit } from "../notifications/notifications.repository.js";
import { discountLabelFor, priceCart, type CartDiscount } from "./pos.schema.js";
import type {
  Catalog,
  CashierProfile,
  CatalogCategory,
  CatalogProduct,
  OrderInput,
  PaymentMethod,
  PricingSettings,
  Sale,
  VatClass,
} from "./pos.schema.js";

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
  vat_class: VatClass;
  sc_pwd_eligible: boolean;
}

/**
 * The live register feed for one Tenant: active products only, joined to their
 * category, plus the store name for the lock bar. Strictly scoped to
 * `tenantId` (read from the verified session, never the request).
 */
export async function getCatalog(tenantId: string): Promise<Catalog> {
  const store = await query<{
    name: string;
    slug: string | null;
    address: string | null;
    phone: string | null;
    tin: string | null;
    business_style: string | null;
    vat_label: string | null;
    receipt_header: string | null;
    receipt_footer: string | null;
    logo_url: string | null;
    receipt_show_logo: boolean;
    receipt_ptu: string | null;
    receipt_min: string | null;
    receipt_serial: string | null;
  }>(
    `SELECT name, slug, address, phone, tin, business_style, vat_label, receipt_header, receipt_footer,
            logo_url, receipt_show_logo, receipt_ptu, receipt_min, receipt_serial
       FROM tenants WHERE id = $1`,
    [tenantId],
  );

  const cats = await query<CatalogCategory>(
    `SELECT id, name FROM categories WHERE tenant_id = $1 ORDER BY sort_order ASC, lower(name) ASC`,
    [tenantId],
  );

  const prods = await query<CatalogRow>(
    `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.sku,
            p.price_cents, p.stock, p.low_stock_threshold, p.image_url, p.vat_class,
            p.sc_pwd_eligible
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
    vatClass: r.vat_class,
    scPwdEligible: r.sc_pwd_eligible,
  }));

  const s = store.rows[0];
  return {
    store: {
      name: s?.name ?? "Store",
      slug: s?.slug ?? null,
      address: s?.address ?? null,
      phone: s?.phone ?? null,
      tin: s?.tin ?? null,
      businessStyle: s?.business_style ?? null,
      vatLabel: s?.vat_label ?? null,
      receiptHeader: s?.receipt_header ?? null,
      receiptFooter: s?.receipt_footer ?? null,
      logoUrl: s?.receipt_show_logo === false ? null : s?.logo_url ?? null,
      ptu: s?.receipt_ptu ?? null,
      min: s?.receipt_min ?? null,
      serial: s?.receipt_serial ?? null,
    },
    categories: cats.rows,
    products,
    paymentQrs,
    pricing: await getPricingSettings(tenantId),
  };
}

/**
 * The tenant's discount rules (CRM → Discounts). Defaults — 1 pt per ₱100,
 * 1 pt = ₱1, member discount off — are the column defaults, so a tenant that
 * never opened the settings prices exactly as before.
 */
export async function getPricingSettings(tenantId: string): Promise<PricingSettings> {
  const { rows } = await query<{
    loyalty_pesos_per_point: number;
    loyalty_point_value_cents: number;
    member_discount_pct: number;
    member_discount_min_spend_cents: number;
  }>(
    `SELECT loyalty_pesos_per_point, loyalty_point_value_cents,
            member_discount_pct, member_discount_min_spend_cents
       FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const r = rows[0];
  return {
    pesosPerPoint: r?.loyalty_pesos_per_point ?? 100,
    pointValueCents: r?.loyalty_point_value_cents ?? 100,
    memberDiscountPct: r?.member_discount_pct ?? 0,
    memberMinSpendCents: r?.member_discount_min_spend_cents ?? 0,
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
  | { code: "INSUFFICIENT_CASH"; totalCents: number }
  | { code: "NO_ELIGIBLE_ITEMS" }
  | { code: "MEMBER_REQUIRES_CUSTOMER" }
  | { code: "MEMBER_DISCOUNT_OFF" }
  | { code: "MEMBER_NOT_ELIGIBLE"; minSpendCents: number };

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

    const resolved: {
      id: string;
      name: string;
      unit: number;
      qty: number;
      lineTotal: number;
      threshold: number;
      vatClass: VatClass;
      scPwdEligible: boolean;
    }[] = [];

    for (const [productId, qty] of wanted) {
      const r = await client.query<{
        id: string;
        name: string;
        price_cents: number;
        stock: number;
        low_stock_threshold: number;
        vat_class: VatClass;
        sc_pwd_eligible: boolean;
      }>(
        `SELECT id, name, price_cents, stock, low_stock_threshold, vat_class, sc_pwd_eligible
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
      resolved.push({
        id: row.id,
        name: row.name,
        unit: row.price_cents,
        qty,
        lineTotal,
        threshold: row.low_stock_threshold,
        vatClass: row.vat_class,
        scPwdEligible: row.sc_pwd_eligible,
      });
    }

    // Resolve + LOCK the CRM customer first (when one is attached), so a loyalty
    // redemption reads a balance that no concurrent sale can spend underneath us.
    // Only a customer that genuinely belongs to this Tenant is honoured — a
    // tampered client can neither attach another store's customer nor redeem
    // their points.
    let customerId: string | null = null;
    let loyaltyBalance = 0;
    if (input.customerId) {
      const owns = await client.query<{ loyalty_points: number }>(
        `SELECT loyalty_points FROM customers
          WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE
          FOR UPDATE`,
        [input.customerId, tenantId],
      );
      if (owns.rows[0]) {
        customerId = input.customerId;
        loyaltyBalance = owns.rows[0].loyalty_points;
      }
    }

    // Price the cart server-side (priceCart). The client sends only a discount
    // CATEGORY; the amount comes from the law (Senior/PWD) or the owner's CRM
    // settings (member %), and points are clamped to the live balance. Every
    // peso figure is server-authoritative; a tampered client cannot set its own.
    const pricing = await getPricingSettings(tenantId);
    let discount: CartDiscount | null = null;
    let scPwdIdNumber: string | null = null;
    let scPwdName: string | null = null;
    let scPwdType: "senior" | "pwd" | null = null;
    if (input.discount?.type === "senior" || input.discount?.type === "pwd") {
      discount = { kind: input.discount.type };
      scPwdType = input.discount.type;
      scPwdIdNumber = input.discount.idNumber;
      scPwdName = input.discount.holderName;
    } else if (input.discount?.type === "member") {
      // Member pricing needs an attached, qualifying CRM customer and the owner
      // must have switched it on — each checked here, never trusted from the till.
      if (!customerId) {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "MEMBER_REQUIRES_CUSTOMER" } };
      }
      if (pricing.memberDiscountPct <= 0) {
        await client.query("ROLLBACK");
        return { ok: false, error: { code: "MEMBER_DISCOUNT_OFF" } };
      }
      if (pricing.memberMinSpendCents > 0) {
        const spent = await client.query<{ spent: string }>(
          `SELECT coalesce(sum(total_cents), 0) AS spent FROM sales
            WHERE tenant_id = $1 AND customer_id = $2`,
          [tenantId, customerId],
        );
        if (Number(spent.rows[0]?.spent ?? 0) < pricing.memberMinSpendCents) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            error: { code: "MEMBER_NOT_ELIGIBLE", minSpendCents: pricing.memberMinSpendCents },
          };
        }
      }
      discount = { kind: "member", pct: pricing.memberDiscountPct };
    }

    const priced = priceCart({
      lines: resolved.map((it) => ({
        vatClass: it.vatClass,
        grossCents: it.lineTotal,
        scPwdEligible: it.scPwdEligible,
      })),
      discount,
      requestedPoints: customerId ? (input.redeemPoints ?? 0) : 0,
      pointsBalance: loyaltyBalance,
      pointValueCents: pricing.pointValueCents,
    });
    if (scPwdType && priced.eligibleLineCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: { code: "NO_ELIGIBLE_ITEMS" } };
    }
    const { grossCents, discountCents, pointsRedeemed, netCents } = priced;
    const { vatCents, subtotalCents, vatableSalesCents, vatExemptCents, zeroRatedCents } = priced;
    const discountLabel = discountLabelFor(discount, pointsRedeemed);

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

    // Stock is decremented *after* the sale row exists (below), so each movement
    // is journalled against its sale's id. Low-stock hits are gathered there for
    // the post-commit notification.
    const lowStockHits: LowStockHit[] = [];

    // Points earned accrue on what was actually paid (net of every discount,
    // redemption included) — 1 point per `pesosPerPoint` (default ₱100).
    const pointsEarned = customerId ? Math.floor(netCents / (pricing.pesosPerPoint * 100)) : 0;

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

    const saleRes = await client.query<{ id: string; created_at: Date }>(
      `INSERT INTO sales
         (tenant_id, cashier_user_id, reference, subtotal_cents, vat_cents, total_cents,
          payment_method, tendered_cents, change_cents, payment_ref, discount_cents, discount_label,
          shift_id, customer_id, points_earned, points_redeemed,
          vatable_sales_cents, vat_exempt_cents, zero_rated_cents, sc_pwd_id_number, sc_pwd_name, sc_pwd_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
        pointsEarned,
        pointsRedeemed,
        vatableSalesCents,
        vatExemptCents,
        zeroRatedCents,
        scPwdIdNumber,
        scPwdName,
        scPwdType,
      ],
    );
    const saleId = saleRes.rows[0].id;

    for (const it of resolved) {
      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, name, unit_price_cents, qty, line_total_cents, vat_class)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [saleId, it.id, it.name, it.unit, it.qty, it.lineTotal, it.vatClass],
      );
    }

    // Decrement stock through the ledger (rows already locked above), one signed
    // movement per line tagged to this sale. Stock was validated under the held
    // lock, so a NEGATIVE result here would mean a logic error, not a race —
    // surface it by throwing into the catch/ROLLBACK rather than overselling.
    for (const it of resolved) {
      const moved = await moveStock(client, {
        tenantId,
        productId: it.id,
        qtyDelta: -it.qty,
        reason: "sale",
        refTable: "sales",
        refId: saleId,
        createdBy: cashierUserId,
      });
      if (!moved.ok) {
        throw new Error(`stock ledger refused sale line ${it.id}: ${moved.code}`);
      }
      if (it.threshold > 0 && moved.balanceAfter <= it.threshold) {
        lowStockHits.push({ id: it.id, name: it.name, stock: moved.balanceAfter, threshold: it.threshold });
      }
    }

    // Loyalty settles in this same transaction: deduct any points the customer
    // redeemed and credit the points earned (1 pt / ₱100 of net). The row was
    // locked above and `pointsRedeemed` was clamped to the balance, so the net
    // change can never drive the account negative.
    if (customerId) {
      const delta = pointsEarned - pointsRedeemed;
      if (delta !== 0) {
        await client.query(
          `UPDATE customers SET loyalty_points = GREATEST(0, loyalty_points + $1), updated_at = now()
            WHERE id = $2 AND tenant_id = $3`,
          [delta, customerId, tenantId],
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
        vatableSalesCents,
        vatExemptCents,
        zeroRatedCents,
        grossCents,
        discountCents,
        discountLabel,
        totalCents: netCents,
        paymentMethod: input.paymentMethod as PaymentMethod,
        paymentRef: input.referenceCode ?? null,
        tenderedCents,
        changeCents,
        pointsEarned,
        pointsRedeemed,
        scPwdIdNumber,
        scPwdName,
        scPwdType,
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
