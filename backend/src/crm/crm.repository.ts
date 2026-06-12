import { query } from "../db.js";
import type {
  Customer,
  CustomerCreateInput,
  CustomerDetail,
  CustomerLite,
  CustomerSale,
  CustomerUpdateInput,
} from "./crm.schema.js";

/**
 * Data access for CRM. EVERY query is scoped by `tenantId` (read from the
 * verified JWT session, never the request body); writes match on
 * `id AND tenant_id`. Lifetime spend / order counts are aggregated live from
 * `sales` (linked by `sales.customer_id`). Money is integer centavos.
 */
const MNL = "Asia/Manila";

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tags: string[] | null;
  note: string | null;
  loyalty_points: number;
  is_active: boolean;
  order_count: string;
  total_spent: string;
  last_order_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    tags: row.tags ?? [],
    note: row.note,
    loyaltyPoints: row.loyalty_points,
    isActive: row.is_active,
    orderCount: Number(row.order_count),
    totalSpentCents: Number(row.total_spent),
    lastOrderAt: row.last_order_at ? row.last_order_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// The lifetime stats subquery, reused by list + detail.
const CUSTOMER_SELECT = `c.id, c.name, c.phone, c.email, c.address, c.tags, c.note,
  c.loyalty_points, c.is_active, c.created_at, c.updated_at,
  coalesce(s.order_count, 0) AS order_count,
  coalesce(s.total_spent, 0) AS total_spent,
  s.last_order_at`;

const SALES_AGG = `LEFT JOIN (
    SELECT customer_id,
           count(*)            AS order_count,
           sum(total_cents)    AS total_spent,
           max(created_at)     AS last_order_at
      FROM sales
     WHERE customer_id IS NOT NULL
     GROUP BY customer_id
  ) s ON s.customer_id = c.id`;

export async function listCustomers(tenantId: string): Promise<Customer[]> {
  const { rows } = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
       FROM customers c
       ${SALES_AGG}
      WHERE c.tenant_id = $1
      ORDER BY c.is_active DESC, lower(c.name) ASC`,
    [tenantId],
  );
  return rows.map(toCustomer);
}

export async function getCustomer(tenantId: string, id: string): Promise<CustomerDetail | null> {
  const { rows } = await query<CustomerRow>(
    `SELECT ${CUSTOMER_SELECT}
       FROM customers c
       ${SALES_AGG}
      WHERE c.id = $1 AND c.tenant_id = $2`,
    [id, tenantId],
  );
  if (!rows[0]) return null;
  const salesRes = await query<{
    id: string;
    reference: string;
    total_cents: number;
    payment_method: string;
    created_at: Date;
  }>(
    `SELECT id, reference, total_cents, payment_method, created_at
       FROM sales WHERE tenant_id = $1 AND customer_id = $2
      ORDER BY created_at DESC LIMIT 20`,
    [tenantId, id],
  );
  const recentSales: CustomerSale[] = salesRes.rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    totalCents: r.total_cents,
    paymentMethod: r.payment_method,
    createdAt: r.created_at.toISOString(),
  }));
  return { ...toCustomer(rows[0]), recentSales };
}

/** Name/phone search for the POS customer picker (active customers only). */
export async function searchCustomers(tenantId: string, q: string): Promise<CustomerLite[]> {
  const term = `%${q.trim()}%`;
  const { rows } = await query<{ id: string; name: string; phone: string | null; loyalty_points: number }>(
    `SELECT id, name, phone, loyalty_points
       FROM customers
      WHERE tenant_id = $1 AND is_active = TRUE
        AND (name ILIKE $2 OR coalesce(phone, '') ILIKE $2)
      ORDER BY lower(name) ASC
      LIMIT 8`,
    [tenantId, term],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, loyaltyPoints: r.loyalty_points }));
}

export async function createCustomer(tenantId: string, input: CustomerCreateInput): Promise<Customer> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO customers (tenant_id, name, phone, email, address, tags, note, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tenantId,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.tags ?? [],
      input.note ?? null,
      input.isActive ?? true,
    ],
  );
  const created = await getCustomer(tenantId, rows[0].id);
  if (!created) throw new Error("Customer vanished immediately after insert.");
  return created;
}

export async function updateCustomer(
  tenantId: string,
  id: string,
  input: CustomerUpdateInput,
): Promise<Customer | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.phone !== undefined) set("phone", input.phone ?? null);
  if (input.email !== undefined) set("email", input.email ?? null);
  if (input.address !== undefined) set("address", input.address ?? null);
  if (input.tags !== undefined) set("tags", input.tags ?? []);
  if (input.note !== undefined) set("note", input.note ?? null);
  if (input.isActive !== undefined) set("is_active", input.isActive);
  if (sets.length === 0) return getCustomer(tenantId, id);
  sets.push("updated_at = now()");

  const { rows } = await query<{ id: string }>(
    `UPDATE customers SET ${sets.join(", ")} WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId, ...vals],
  );
  if (!rows[0]) return null;
  return getCustomer(tenantId, id);
}

export async function deleteCustomer(tenantId: string, id: string): Promise<boolean> {
  // Sales keep their history (sales.customer_id → ON DELETE SET NULL).
  const { rowCount } = await query(`DELETE FROM customers WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return (rowCount ?? 0) > 0;
}

// ── Summary KPIs ──────────────────────────────────────────────────────────────

export interface CrmSummary {
  totalCustomers: number;
  newThisMonth: number;
  repeatCustomers: number;
  loyaltyPointsOutstanding: number;
}

export async function getCrmSummary(tenantId: string): Promise<CrmSummary> {
  const res = await query<{
    total: number;
    new_month: number;
    repeat: number;
    points: string;
  }>(
    `SELECT
        (SELECT count(*)::int FROM customers WHERE tenant_id = $1 AND is_active = TRUE) AS total,
        (SELECT count(*)::int FROM customers
           WHERE tenant_id = $1
             AND (created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)) AS new_month,
        (SELECT count(*)::int FROM (
            SELECT customer_id FROM sales
             WHERE tenant_id = $1 AND customer_id IS NOT NULL
             GROUP BY customer_id HAVING count(*) >= 2
          ) r) AS repeat,
        (SELECT coalesce(sum(loyalty_points), 0)::bigint FROM customers WHERE tenant_id = $1) AS points`,
    [tenantId, MNL],
  );
  const r = res.rows[0];
  return {
    totalCustomers: r.total,
    newThisMonth: r.new_month,
    repeatCustomers: r.repeat,
    loyaltyPointsOutstanding: Number(r.points),
  };
}
