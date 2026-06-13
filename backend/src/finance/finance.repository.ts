import { query } from "../db.js";
import type { Expense, ExpenseCreateInput, ExpenseUpdateInput } from "./finance.schema.js";
import {
  buildBalanceSheet,
  buildCashFlow,
  type BalanceSheet,
  type CashFlow,
} from "./finance.reports.js";

/**
 * Data access for Finance. EVERY query is scoped by `tenantId` (read from the
 * verified JWT session, never the request body); writes match on
 * `id AND tenant_id`. Money is integer centavos throughout. All period maths is
 * done in Asia/Manila so "this month" matches the merchant's wall clock.
 */
const MNL = "Asia/Manila";

// ── Expenses CRUD ────────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string;
  incurred_on: Date;
  category: string;
  payee: string | null;
  amount_cents: number;
  payment_method: string;
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Postgres DATE comes back as a Date at local midnight; keep just the day. */
function toIsoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    incurredOn: toIsoDate(row.incurred_on),
    category: row.category,
    payee: row.payee,
    amountCents: row.amount_cents,
    amount: row.amount_cents / 100,
    paymentMethod: row.payment_method,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const EXPENSE_COLUMNS = `id, incurred_on, category, payee, amount_cents,
  payment_method, note, created_at, updated_at`;

export interface ListExpenseFilters {
  from?: string;
  to?: string;
  limit?: number;
}

export async function listExpenses(
  tenantId: string,
  filters: ListExpenseFilters = {},
): Promise<Expense[]> {
  const where: string[] = ["tenant_id = $1"];
  const vals: unknown[] = [tenantId];
  if (filters.from) {
    vals.push(filters.from);
    where.push(`incurred_on >= $${vals.length}`);
  }
  if (filters.to) {
    vals.push(filters.to);
    where.push(`incurred_on <= $${vals.length}`);
  }
  vals.push(Math.min(Math.max(filters.limit ?? 500, 1), 1000));
  const { rows } = await query<ExpenseRow>(
    `SELECT ${EXPENSE_COLUMNS}
       FROM expenses
      WHERE ${where.join(" AND ")}
      ORDER BY incurred_on DESC, created_at DESC
      LIMIT $${vals.length}`,
    vals,
  );
  return rows.map(toExpense);
}

export async function getExpense(tenantId: string, id: string): Promise<Expense | null> {
  const { rows } = await query<ExpenseRow>(
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return rows[0] ? toExpense(rows[0]) : null;
}

export async function createExpense(
  tenantId: string,
  input: ExpenseCreateInput,
  createdBy: string | null,
): Promise<Expense> {
  const { rows } = await query<ExpenseRow>(
    `INSERT INTO expenses
       (tenant_id, incurred_on, category, payee, amount_cents, payment_method, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${EXPENSE_COLUMNS}`,
    [
      tenantId,
      input.incurredOn,
      input.category,
      input.payee ?? null,
      input.amount,
      input.paymentMethod,
      input.note ?? null,
      createdBy,
    ],
  );
  return toExpense(rows[0]);
}

export async function updateExpense(
  tenantId: string,
  id: string,
  input: ExpenseUpdateInput,
): Promise<Expense | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${sets.length + 3}`);
    vals.push(val);
  };
  if (input.incurredOn !== undefined) set("incurred_on", input.incurredOn);
  if (input.category !== undefined) set("category", input.category);
  if (input.payee !== undefined) set("payee", input.payee ?? null);
  if (input.amount !== undefined) set("amount_cents", input.amount);
  if (input.paymentMethod !== undefined) set("payment_method", input.paymentMethod);
  if (input.note !== undefined) set("note", input.note ?? null);
  if (sets.length === 0) return getExpense(tenantId, id);
  sets.push("updated_at = now()");

  const { rows } = await query<ExpenseRow>(
    `UPDATE expenses SET ${sets.join(", ")}
      WHERE id = $1 AND tenant_id = $2
      RETURNING ${EXPENSE_COLUMNS}`,
    [id, tenantId, ...vals],
  );
  return rows[0] ? toExpense(rows[0]) : null;
}

export async function deleteExpense(tenantId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM expenses WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

// ── P&L summary (revenue from sales vs. expenses) ────────────────────────────

export interface CategorySlice {
  category: string;
  totalCents: number;
  count: number;
}

export interface TrendPoint {
  ym: string;
  label: string;
  grossCents: number;
  netCents: number;
  spentCents: number;
  profitCents: number;
}

export interface FinanceSummary {
  month: string;
  monthLabel: string;
  revenue: {
    grossCents: number;
    netCents: number;
    vatCents: number;
    discountCents: number;
    txns: number;
  };
  expenseCents: number;
  /** Net taxable sales − expenses (VAT is a pass-through, not income). */
  netProfitCents: number;
  /** Net profit as a percentage of net sales (0 when there are no sales). */
  marginPct: number;
  byCategory: CategorySlice[];
  trend: TrendPoint[];
}

/**
 * The merchant P&L. Revenue is summed live from `sales` (POS checkouts) and set
 * against the `expenses` ledger, all in Asia/Manila months. `months` is the
 * length of the trend window (clamped 1–24, default 6, including the current
 * month).
 */
export async function getFinanceSummary(tenantId: string, months = 6): Promise<FinanceSummary> {
  const window = Math.min(Math.max(months, 1), 24);

  const revRes = await query<{
    gross: string;
    net: string;
    vat: string;
    discount: string;
    txns: number;
  }>(
    `SELECT coalesce(sum(total_cents), 0)::bigint    AS gross,
            coalesce(sum(subtotal_cents), 0)::bigint AS net,
            coalesce(sum(vat_cents), 0)::bigint      AS vat,
            coalesce(sum(discount_cents), 0)::bigint AS discount,
            count(*) FILTER (WHERE kind = 'sale')::int AS txns
       FROM sales
      WHERE tenant_id = $1
        AND (created_at AT TIME ZONE $2) >= date_trunc('month', now() AT TIME ZONE $2)`,
    [tenantId, MNL],
  );
  const r = revRes.rows[0];
  const grossCents = Number(r.gross);
  const netCents = Number(r.net);

  const expRes = await query<{ spent: string }>(
    `SELECT coalesce(sum(amount_cents), 0)::bigint AS spent
       FROM expenses
      WHERE tenant_id = $1
        AND incurred_on >= date_trunc('month', (now() AT TIME ZONE $2))::date`,
    [tenantId, MNL],
  );
  const expenseCents = Number(expRes.rows[0].spent);

  const catRes = await query<{ category: string; total: string; n: number }>(
    `SELECT category,
            coalesce(sum(amount_cents), 0)::bigint AS total,
            count(*)::int AS n
       FROM expenses
      WHERE tenant_id = $1
        AND incurred_on >= date_trunc('month', (now() AT TIME ZONE $2))::date
      GROUP BY category
      ORDER BY total DESC`,
    [tenantId, MNL],
  );
  const byCategory: CategorySlice[] = catRes.rows.map((row) => ({
    category: row.category,
    totalCents: Number(row.total),
    count: row.n,
  }));

  const trendRes = await query<{
    ym: string;
    label: string;
    gross: string;
    net: string;
    spent: string;
  }>(
    `WITH months AS (
        SELECT m,
               to_char(m, 'YYYY-MM') AS ym,
               to_char(m, 'Mon') AS label
          FROM generate_series(
                 date_trunc('month', (now() AT TIME ZONE $2)) - make_interval(months => $3::int),
                 date_trunc('month', (now() AT TIME ZONE $2)),
                 interval '1 month'
               ) AS m
      ),
      rev AS (
        SELECT to_char(date_trunc('month', created_at AT TIME ZONE $2), 'YYYY-MM') AS ym,
               sum(total_cents)::bigint    AS gross,
               sum(subtotal_cents)::bigint AS net
          FROM sales
         WHERE tenant_id = $1
         GROUP BY 1
      ),
      exp AS (
        SELECT to_char(date_trunc('month', incurred_on), 'YYYY-MM') AS ym,
               sum(amount_cents)::bigint AS spent
          FROM expenses
         WHERE tenant_id = $1
         GROUP BY 1
      )
      SELECT months.ym,
             months.label,
             coalesce(rev.gross, 0)::bigint AS gross,
             coalesce(rev.net, 0)::bigint   AS net,
             coalesce(exp.spent, 0)::bigint AS spent
        FROM months
        LEFT JOIN rev ON rev.ym = months.ym
        LEFT JOIN exp ON exp.ym = months.ym
       ORDER BY months.m ASC`,
    [tenantId, MNL, window - 1],
  );
  const trend: TrendPoint[] = trendRes.rows.map((row) => {
    const net = Number(row.net);
    const spent = Number(row.spent);
    return {
      ym: row.ym,
      label: row.label,
      grossCents: Number(row.gross),
      netCents: net,
      spentCents: spent,
      profitCents: net - spent,
    };
  });

  const monthRes = await query<{ ym: string; label: string }>(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS ym,
            to_char(now() AT TIME ZONE $1, 'FMMonth YYYY') AS label`,
    [MNL],
  );

  return {
    month: monthRes.rows[0].ym,
    monthLabel: monthRes.rows[0].label,
    revenue: {
      grossCents,
      netCents,
      vatCents: Number(r.vat),
      discountCents: Number(r.discount),
      txns: r.txns,
    },
    expenseCents,
    netProfitCents: netCents - expenseCents,
    marginPct: netCents > 0 ? Math.round(((netCents - expenseCents) / netCents) * 1000) / 10 : 0,
    byCategory,
    trend,
  };
}

// ── Balance sheet (financial position as of today) ───────────────────────────

/**
 * A snapshot balance sheet derived from the ledgers (see finance.reports.ts for
 * the cash definition). Inventory is valued at each product's latest known
 * purchase cost × on-hand; products never purchased contribute 0. All figures
 * are cumulative (all-time), so this reads as the store's current net position.
 */
export async function getBalanceSheet(tenantId: string): Promise<BalanceSheet> {
  const res = await query<{
    collected: string;
    expenses: string;
    received: string;
    inventory: string;
    vat: string;
    ap: string;
    as_of: string;
  }>(
    `SELECT
       (SELECT coalesce(sum(total_cents), 0)::bigint FROM sales
          WHERE tenant_id = $1) AS collected,
       (SELECT coalesce(sum(amount_cents), 0)::bigint FROM expenses
          WHERE tenant_id = $1) AS expenses,
       (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
          WHERE tenant_id = $1 AND status = 'received') AS received,
       (WITH latest_cost AS (
          SELECT DISTINCT ON (i.product_id) i.product_id, i.unit_cost_cents
            FROM purchase_order_items i
            JOIN purchase_orders po ON po.id = i.po_id
           WHERE po.tenant_id = $1
           ORDER BY i.product_id, po.created_at DESC
        )
        SELECT coalesce(sum(p.stock * coalesce(lc.unit_cost_cents, 0)), 0)::bigint
          FROM products p
          LEFT JOIN latest_cost lc ON lc.product_id = p.id
         WHERE p.tenant_id = $1) AS inventory,
       (SELECT coalesce(sum(vat_cents), 0)::bigint FROM sales
          WHERE tenant_id = $1) AS vat,
       (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
          WHERE tenant_id = $1 AND status IN ('draft', 'ordered')) AS ap,
       to_char(now() AT TIME ZONE $2, 'YYYY-MM-DD') AS as_of`,
    [tenantId, MNL],
  );
  const r = res.rows[0];
  const cashCents = Number(r.collected) - Number(r.expenses) - Number(r.received);
  return buildBalanceSheet(r.as_of, {
    cashCents,
    inventoryValueCents: Number(r.inventory),
    vatPayableCents: Number(r.vat),
    accountsPayableCents: Number(r.ap),
  });
}

// ── Cash flow (direct method, one Manila month) ──────────────────────────────

export interface CashFlowResult extends CashFlow {
  month: string;
  monthLabel: string;
}

/**
 * A direct-method cash-flow statement for one Manila month. `month` is an
 * optional YYYY-MM; anything else falls back to the current month. Opening cash
 * is the cumulative position strictly before the month, so opening + net change
 * reconciles to closing.
 */
export async function getCashFlow(tenantId: string, month?: string): Promise<CashFlowResult> {
  const res = await query<{
    ym: string;
    start: string;
    end_incl: string;
    label: string;
    sales_period: string;
    exp_period: string;
    recv_period: string;
    sales_before: string;
    exp_before: string;
    recv_before: string;
  }>(
    `WITH b AS (
        SELECT s AS start, (s + interval '1 month')::date AS next
          FROM (
            SELECT CASE WHEN $2 ~ '^\\d{4}-\\d{2}$'
                        THEN to_date($2 || '-01', 'YYYY-MM-DD')
                        ELSE (date_trunc('month', now() AT TIME ZONE $3))::date
                   END AS s
          ) q
      )
      SELECT to_char(b.start, 'YYYY-MM')                              AS ym,
             to_char(b.start, 'YYYY-MM-DD')                          AS start,
             to_char((b.next - interval '1 day')::date, 'YYYY-MM-DD') AS end_incl,
             to_char(b.start, 'FMMonth YYYY')                        AS label,
             (SELECT coalesce(sum(total_cents), 0)::bigint FROM sales
                WHERE tenant_id = $1
                  AND (created_at AT TIME ZONE $3) >= b.start
                  AND (created_at AT TIME ZONE $3) <  b.next)         AS sales_period,
             (SELECT coalesce(sum(amount_cents), 0)::bigint FROM expenses
                WHERE tenant_id = $1
                  AND incurred_on >= b.start AND incurred_on < b.next) AS exp_period,
             (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
                WHERE tenant_id = $1 AND status = 'received'
                  AND (received_at AT TIME ZONE $3) >= b.start
                  AND (received_at AT TIME ZONE $3) <  b.next)         AS recv_period,
             (SELECT coalesce(sum(total_cents), 0)::bigint FROM sales
                WHERE tenant_id = $1
                  AND (created_at AT TIME ZONE $3) < b.start)          AS sales_before,
             (SELECT coalesce(sum(amount_cents), 0)::bigint FROM expenses
                WHERE tenant_id = $1 AND incurred_on < b.start)        AS exp_before,
             (SELECT coalesce(sum(total_cents), 0)::bigint FROM purchase_orders
                WHERE tenant_id = $1 AND status = 'received'
                  AND (received_at AT TIME ZONE $3) < b.start)         AS recv_before
        FROM b`,
    [tenantId, month ?? "", MNL],
  );
  const r = res.rows[0];
  const openingCashCents =
    Number(r.sales_before) - Number(r.exp_before) - Number(r.recv_before);
  const statement = buildCashFlow(r.start, r.end_incl, {
    salesCollectedCents: Number(r.sales_period),
    expensesPaidCents: Number(r.exp_period),
    goodsReceivedCents: Number(r.recv_period),
    openingCashCents,
  });
  return { ...statement, month: r.ym, monthLabel: r.label };
}
