/**
 * Client for the Merchant Finance module (`/api/v1/finance/*`) — operating
 * expenses + a live P&L that sets POS revenue against those expenses. The
 * tenant scope is enforced server-side from the session cookie, so every call
 * just rides with `credentials: "include"`. All payloads are plain JSON.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/finance`;

/** Buckets the backend accepts — kept in sync with finance.schema.ts. */
export const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Payroll",
  "Supplies",
  "Inventory / COGS",
  "Marketing",
  "Maintenance",
  "Transport",
  "Taxes & Licenses",
  "Other",
] as const;

export const EXPENSE_METHODS = [
  "Cash",
  "GCash",
  "Maya",
  "Bank Transfer",
  "Card",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export interface Expense {
  id: string;
  incurredOn: string;
  category: string;
  payee: string | null;
  amountCents: number;
  amount: number;
  paymentMethod: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  netProfitCents: number;
  marginPct: number;
  byCategory: CategorySlice[];
  trend: TrendPoint[];
}

/** Fields the expense form collects; amount is in pesos (backend stores centavos). */
export interface ExpenseFields {
  incurredOn: string;
  category: string;
  payee: string;
  amount: string;
  paymentMethod: string;
  note: string;
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: Record<string, string> };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = {
  ok: false as const,
  error: "Could not reach the server. Check your connection.",
};

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getFinanceSummary(months = 6): Promise<Result<{ summary: FinanceSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary?months=${months}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listExpenses(): Promise<Result<{ expenses: Expense[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/expenses`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createExpense(fields: ExpenseFields): Promise<Result<{ expense: Expense }>> {
  try {
    const res = await fetch(`${BASE}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateExpense(
  id: string,
  fields: Partial<ExpenseFields>,
): Promise<Result<{ expense: Expense }>> {
  try {
    const res = await fetch(`${BASE}/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteExpense(id: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/expenses/${id}`, { method: "DELETE", credentials: "include" });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}
