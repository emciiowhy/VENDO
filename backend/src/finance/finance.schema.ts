import { z } from "zod";

/**
 * Validation for the Merchant Finance module (operating expenses + P&L).
 *
 * Expense payloads arrive as JSON, but we still accept money as a peso number
 * (or peso string) and normalise to integer centavos before it reaches the
 * repository — the same money discipline used across Inventory and the POS.
 */

/** The expense buckets a small Philippine retailer actually tracks. */
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

/** How the cost was settled — mirrors the POS settlement channels + a few more. */
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

/** Pesos (e.g. "1,500.00") → integer centavos (150000). */
const pesosToCents = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[₱,\s]/g, ""))))
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid amount.")
  .transform((n) => Math.round(n * 100));

/** A calendar date the cost applies to, as YYYY-MM-DD. */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD).")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date.");

// Empty/whitespace-only strings collapse to undefined ("not provided") so a
// blank payee or note is stored as NULL rather than "".
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const expenseCreateSchema = z.object({
  incurredOn: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  payee: optionalText(160),
  // Wire value is pesos; after parse this holds integer centavos.
  amount: pesosToCents,
  paymentMethod: z.enum(EXPENSE_METHODS).default("Cash"),
  note: optionalText(500),
});

/** Update: every field optional, but the shape is still validated. */
export const expenseUpdateSchema = expenseCreateSchema.partial();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

/** API-facing expense (camelCase, money as both cents and a peso number). */
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
