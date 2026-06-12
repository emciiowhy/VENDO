import { pool, query } from "../db.js";
import type {
  PoCreateInput,
  PurchaseOrderDetail,
  PurchaseOrderItem,
  PurchaseOrderSummary,
  Supplier,
  SupplierCreateInput,
  SupplierUpdateInput,
} from "./procurement.schema.js";

/**
 * Data access for Procurement. EVERY query is scoped by `tenantId` (read from
 * the verified JWT session, never the request body); writes match on
 * `id AND tenant_id`. Money is integer centavos throughout. Receiving a PO runs
 * in one transaction that increments `products.stock` — the inbound mirror of
 * the POS checkout's decrement (see pos.repository.createOrder).
 */

// ── Suppliers ────────────────────────────────────────────────────────────────

interface SupplierRow {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    note: row.note,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const SUPPLIER_COLUMNS = `id, name, contact_name, email, phone, address, note, is_active,
  created_at, updated_at`;

export async function listSuppliers(tenantId: string): Promise<Supplier[]> {
  const { rows } = await query<SupplierRow>(
    `SELECT ${SUPPLIER_COLUMNS}
       FROM suppliers
      WHERE tenant_id = $1
      ORDER BY is_active DESC, lower(name) ASC`,
    [tenantId],
  );
  return rows.map(toSupplier);
}

export async function getSupplier(tenantId: string, id: string): Promise<Supplier | null> {
  const { rows } = await query<SupplierRow>(
    `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toSupplier(rows[0]) : null;
}

export async function createSupplier(
  tenantId: string,
  input: SupplierCreateInput,
): Promise<Supplier> {
  const { rows } = await query<SupplierRow>(
    `INSERT INTO suppliers (tenant_id, name, contact_name, email, phone, address, note, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SUPPLIER_COLUMNS}`,
    [
      tenantId,
      input.name,
      input.contactName ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.address ?? null,
      input.note ?? null,
      input.isActive ?? true,
    ],
  );
  return toSupplier(rows[0]);
}

export async function updateSupplier(
  tenantId: string,
  id: string,
  input: SupplierUpdateInput,
): Promise<Supplier | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.contactName !== undefined) set("contact_name", input.contactName ?? null);
  if (input.email !== undefined) set("email", input.email ?? null);
  if (input.phone !== undefined) set("phone", input.phone ?? null);
  if (input.address !== undefined) set("address", input.address ?? null);
  if (input.note !== undefined) set("note", input.note ?? null);
  if (input.isActive !== undefined) set("is_active", input.isActive);
  if (sets.length === 0) return getSupplier(tenantId, id);
  sets.push("updated_at = now()");

  const { rows } = await query<SupplierRow>(
    `UPDATE suppliers SET ${sets.join(", ")}
      WHERE id = $1 AND tenant_id = $2
      RETURNING ${SUPPLIER_COLUMNS}`,
    [id, tenantId, ...vals],
  );
  return rows[0] ? toSupplier(rows[0]) : null;
}

export async function deleteSupplier(tenantId: string, id: string): Promise<boolean> {
  // POs reference the supplier with ON DELETE SET NULL, so their history stays.
  const { rowCount } = await query(`DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2`, [
    id,
    tenantId,
  ]);
  return (rowCount ?? 0) > 0;
}

// ── Purchase orders ──────────────────────────────────────────────────────────

interface PoRow {
  id: string;
  reference: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: string;
  order_date: Date;
  expected_date: Date | null;
  received_at: Date | null;
  total_cents: number;
  note: string | null;
  item_count: string;
  created_at: Date;
}

interface PoItemRow {
  id: string;
  product_id: string | null;
  name: string;
  qty: number;
  unit_cost_cents: number;
  line_total_cents: number;
}

function toIsoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function toSummary(row: PoRow): PurchaseOrderSummary {
  return {
    id: row.id,
    reference: row.reference,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    status: row.status,
    orderDate: toIsoDate(row.order_date),
    expectedDate: row.expected_date ? toIsoDate(row.expected_date) : null,
    receivedAt: row.received_at ? row.received_at.toISOString() : null,
    totalCents: row.total_cents,
    itemCount: Number(row.item_count),
    createdAt: row.created_at.toISOString(),
  };
}

function toItem(row: PoItemRow): PurchaseOrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    qty: row.qty,
    unitCostCents: row.unit_cost_cents,
    unitCost: row.unit_cost_cents / 100,
    lineTotalCents: row.line_total_cents,
  };
}

const PO_SELECT = `po.id, po.reference, po.supplier_id, s.name AS supplier_name, po.status,
  po.order_date, po.expected_date, po.received_at, po.total_cents, po.note, po.created_at,
  (SELECT count(*) FROM purchase_order_items i WHERE i.po_id = po.id) AS item_count`;

export async function listPurchaseOrders(tenantId: string): Promise<PurchaseOrderSummary[]> {
  const { rows } = await query<PoRow>(
    `SELECT ${PO_SELECT}
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.tenant_id = $1
      ORDER BY po.created_at DESC`,
    [tenantId],
  );
  return rows.map(toSummary);
}

export async function getPurchaseOrder(
  tenantId: string,
  id: string,
): Promise<PurchaseOrderDetail | null> {
  const { rows } = await query<PoRow>(
    `SELECT ${PO_SELECT}
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = $1 AND po.tenant_id = $2`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  const itemsRes = await query<PoItemRow>(
    `SELECT id, product_id, name, qty, unit_cost_cents, line_total_cents
       FROM purchase_order_items WHERE po_id = $1
      ORDER BY name ASC`,
    [id],
  );
  return { ...toSummary(rows[0]), note: rows[0].note, items: itemsRes.rows.map(toItem) };
}

/**
 * Create a purchase order atomically: reserve a per-Tenant serial (the counter
 * row is locked by the upsert for the rest of the transaction, so two clerks
 * can't collide on a reference), then write the header + line items. The total
 * is computed server-side from the lines — the client never sets it.
 */
export async function createPurchaseOrder(
  tenantId: string,
  createdBy: string | null,
  input: PoCreateInput,
): Promise<PurchaseOrderDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const seqRes = await client.query<{ next_seq: string }>(
      `INSERT INTO po_counters (tenant_id, next_seq)
       VALUES ($1, (SELECT count(*) FROM purchase_orders WHERE tenant_id = $1) + 1)
       ON CONFLICT (tenant_id)
         DO UPDATE SET next_seq = po_counters.next_seq + 1, updated_at = now()
       RETURNING next_seq`,
      [tenantId],
    );
    const reference = `PO-${String(Number(seqRes.rows[0].next_seq)).padStart(6, "0")}`;

    const lines = input.items.map((it) => ({
      productId: it.productId ?? null,
      name: it.name,
      qty: it.qty,
      unitCost: it.unitCost,
      lineTotal: it.unitCost * it.qty,
    }));
    const totalCents = lines.reduce((s, l) => s + l.lineTotal, 0);

    const poRes = await client.query<{ id: string }>(
      `INSERT INTO purchase_orders
         (tenant_id, supplier_id, reference, status, order_date, expected_date, total_cents, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        input.supplierId ?? null,
        reference,
        input.status,
        input.orderDate,
        input.expectedDate ?? null,
        totalCents,
        input.note ?? null,
        createdBy,
      ],
    );
    const poId = poRes.rows[0].id;

    for (const l of lines) {
      await client.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, name, qty, unit_cost_cents, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [poId, l.productId, l.name, l.qty, l.unitCost, l.lineTotal],
      );
    }

    await client.query("COMMIT");
    const detail = await getPurchaseOrder(tenantId, poId);
    if (!detail) throw new Error("Purchase order vanished immediately after insert.");
    return detail;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type PoActionResult =
  | { ok: true; po: PurchaseOrderDetail }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RECEIVED" | "CANCELLED" | "INVALID_STATUS" };

/**
 * Receive a PO: increment catalogue stock for every line that maps to a
 * product, then freeze the PO as received. Runs in one transaction with the PO
 * row locked, so a double-click can't restock twice. Lines with no product_id
 * (free-text / non-catalogue buys) are recorded but don't move stock.
 */
export async function receivePurchaseOrder(
  tenantId: string,
  id: string,
): Promise<PoActionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const poRes = await client.query<{ status: string }>(
      `SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [id, tenantId],
    );
    const po = poRes.rows[0];
    if (!po) {
      await client.query("ROLLBACK");
      return { ok: false, code: "NOT_FOUND" };
    }
    if (po.status === "received") {
      await client.query("ROLLBACK");
      return { ok: false, code: "ALREADY_RECEIVED" };
    }
    if (po.status === "cancelled") {
      await client.query("ROLLBACK");
      return { ok: false, code: "CANCELLED" };
    }

    const itemsRes = await client.query<{ product_id: string | null; qty: number }>(
      `SELECT product_id, qty FROM purchase_order_items WHERE po_id = $1`,
      [id],
    );
    for (const it of itemsRes.rows) {
      if (!it.product_id) continue;
      await client.query(
        `UPDATE products SET stock = stock + $1, updated_at = now()
          WHERE id = $2 AND tenant_id = $3`,
        [it.qty, it.product_id, tenantId],
      );
    }

    await client.query(
      `UPDATE purchase_orders
          SET status = 'received', received_at = now(), updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const detail = await getPurchaseOrder(tenantId, id);
  return detail ? { ok: true, po: detail } : { ok: false, code: "NOT_FOUND" };
}

/**
 * Change a PO's status between draft / ordered / cancelled. A received PO is
 * immutable (stock has already moved), and you can't directly mark "received"
 * here — that goes through receivePurchaseOrder so stock is updated atomically.
 */
export async function setPurchaseOrderStatus(
  tenantId: string,
  id: string,
  status: "draft" | "ordered" | "cancelled",
): Promise<PoActionResult> {
  const current = await query<{ status: string }>(
    `SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (!current.rows[0]) return { ok: false, code: "NOT_FOUND" };
  if (current.rows[0].status === "received") return { ok: false, code: "ALREADY_RECEIVED" };

  await query(
    `UPDATE purchase_orders SET status = $3, updated_at = now()
      WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId, status],
  );
  const detail = await getPurchaseOrder(tenantId, id);
  return detail ? { ok: true, po: detail } : { ok: false, code: "NOT_FOUND" };
}

/** Delete a PO. Received POs are kept as an immutable stock-in record. */
export async function deletePurchaseOrder(
  tenantId: string,
  id: string,
): Promise<"deleted" | "not_found" | "received"> {
  const cur = await query<{ status: string }>(
    `SELECT status FROM purchase_orders WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  if (!cur.rows[0]) return "not_found";
  if (cur.rows[0].status === "received") return "received";
  await query(`DELETE FROM purchase_orders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return "deleted";
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

export interface ProcurementSummary {
  supplierCount: number;
  openOrders: number;
  onOrderValueCents: number;
  receivedThisMonthCents: number;
}

const MNL = "Asia/Manila";

export async function getProcurementSummary(tenantId: string): Promise<ProcurementSummary> {
  const res = await query<{
    suppliers: number;
    open_orders: number;
    on_order: string;
    received_month: string;
  }>(
    `SELECT
        (SELECT count(*)::int FROM suppliers WHERE tenant_id = $1 AND is_active = TRUE) AS suppliers,
        (SELECT count(*)::int FROM purchase_orders
           WHERE tenant_id = $1 AND status IN ('draft', 'ordered')) AS open_orders,
        (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
           WHERE tenant_id = $1 AND status IN ('draft', 'ordered')) AS on_order,
        (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
           WHERE tenant_id = $1 AND status = 'received'
             AND (received_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2))
          AS received_month`,
    [tenantId, MNL],
  );
  const r = res.rows[0];
  return {
    supplierCount: r.suppliers,
    openOrders: r.open_orders,
    onOrderValueCents: Number(r.on_order),
    receivedThisMonthCents: Number(r.received_month),
  };
}
