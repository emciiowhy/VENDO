import { z } from "zod";

/**
 * POS activity log — the pure contracts + summary maths.
 *
 * One timeline of staff activity for the owner/manager:
 *   • FLOOR actions the register reports itself, because they never reach the
 *     sales ledger: voiding a line out of the open cart, cancelling a sale
 *     mid-ring, popping the drawer with no sale (POST /pos/audit).
 *   • SERVER actions written only by the backend, inside the route that did the
 *     work: sales, refunds, voids, discounts, sign-in/out, clock in/out, drawer
 *     shift open/close, timecard corrections and payroll approval. The register
 *     can't post these, so it can't forge or suppress them.
 * The DB write lives in audit.repository.ts; the rollup maths here are pure so
 * they can be unit-tested without a database (see audit.test.ts).
 */

/** Actions the register may POST (shop-floor events with no ledger row). */
export const AUDIT_ACTIONS = ["void_item", "cancel_transaction", "open_drawer"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Actions only the server writes. */
export const SERVER_ACTIONS = [
  "sale",
  "refund",
  "void_sale",
  "discount_applied",
  "login",
  "logout",
  "clock_in",
  "clock_out",
  "shift_open",
  "shift_close",
  "timecard_corrected",
  "payroll_approved",
] as const;
export type ServerAction = (typeof SERVER_ACTIONS)[number];

export const ACTIVITY_ACTIONS = [...AUDIT_ACTIONS, ...SERVER_ACTIONS] as const;
export type ActivityAction = AuditAction | ServerAction;

/** What a terminal posts when one of the FLOOR actions fires (camelCase, centavos). */
export const auditEventSchema = z.object({
  action: z.enum(AUDIT_ACTIONS, {
    errorMap: () => ({ message: "Unknown audit action." }),
  }),
  /** The voided line's name, when the action is `void_item`. */
  itemName: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  /** Units implicated (voided line qty / abandoned cart count). */
  itemQty: z.number().int().positive().max(100_000).optional(),
  /** Peso value implicated, in centavos (voided line total / abandoned cart net). */
  valueCents: z.number().int().nonnegative().max(1_000_000_00).optional(),
  /** Free-text context (e.g. a reason the cashier typed). */
  detail: z.string().trim().max(280).optional().or(z.literal("").transform(() => undefined)),
});

export type AuditEventInput = z.infer<typeof auditEventSchema>;

/** What a server-side route records about the action it just performed. */
export interface ActivityEvent {
  action: ServerAction;
  /** The sale / timecard / shift / payroll run this is about. */
  refId?: string | null;
  itemName?: string | null;
  itemQty?: number | null;
  /** Peso value involved, centavos (sale total, refund, discount). */
  valueCents?: number;
  detail?: string | null;
}

/** A recorded row as the API hands it back (money in centavos). */
export interface AuditLog {
  id: string;
  cashierUserId: string | null;
  /** Who did it — a snapshot of their name at the time. */
  cashierName: string;
  action: ActivityAction;
  refId: string | null;
  itemName: string | null;
  itemQty: number | null;
  valueCents: number;
  detail: string | null;
  createdAt: string;
}

/** Human-readable label for an action, used in the owner's activity table. */
export const AUDIT_ACTION_LABEL: Record<ActivityAction, string> = {
  void_item: "Item voided from cart",
  cancel_transaction: "Transaction cancelled",
  open_drawer: "Cash drawer opened (no sale)",
  sale: "Sale",
  refund: "Refund / return",
  void_sale: "Sale voided",
  discount_applied: "Discount applied",
  login: "Signed in",
  logout: "Signed out",
  clock_in: "Shift in (clock in)",
  clock_out: "Shift out (clock out)",
  shift_open: "Cash drawer opened (shift start)",
  shift_close: "Cash drawer closed (Z-Read)",
  timecard_corrected: "Timecard corrected",
  payroll_approved: "Payroll approved",
};

/**
 * Show only the last 4 characters of a Senior/PWD ID in the log, so the
 * activity timeline never becomes a list of full government ID numbers.
 */
export function maskId(id: string): string {
  const t = id.trim();
  return t.length <= 4 ? "••••" : `••••${t.slice(-4)}`;
}

/** The owner-facing rollup over a set of activity rows. */
export interface AuditSummary {
  total: number;
  byAction: Record<ActivityAction, number>;
  /** Peso value implicated by cart voids, cancels, sale voids and refunds (centavos). */
  flaggedValueCents: number;
}

/** Actions that represent money leaving or not arriving — the shrinkage signal. */
const FLAGGED: ReadonlySet<ActivityAction> = new Set(["void_item", "cancel_transaction", "void_sale", "refund"]);

/**
 * Summarise a window of activity rows: a per-action tally and the total peso
 * value implicated by voids, cancellations and refunds. Pure — fed real rows by
 * the router, exercised directly by the unit tests.
 */
export function summarizeAudit(rows: Pick<AuditLog, "action" | "valueCents">[]): AuditSummary {
  const byAction = Object.fromEntries(ACTIVITY_ACTIONS.map((a) => [a, 0])) as Record<ActivityAction, number>;
  let flaggedValueCents = 0;
  for (const r of rows) {
    byAction[r.action] += 1;
    if (FLAGGED.has(r.action)) flaggedValueCents += r.valueCents;
  }
  return { total: rows.length, byAction, flaggedValueCents };
}

/**
 * The same rollup as summarizeAudit, from per-action SQL counts — used by the
 * paginated log so the totals cover every matching row, not just one page.
 */
export function summarizeCounts(rows: { action: ActivityAction; count: number; valueCents: number }[]): AuditSummary {
  const byAction = Object.fromEntries(ACTIVITY_ACTIONS.map((a) => [a, 0])) as Record<ActivityAction, number>;
  let total = 0;
  let flaggedValueCents = 0;
  for (const r of rows) {
    if (!(r.action in byAction)) continue;
    byAction[r.action] += r.count;
    total += r.count;
    if (FLAGGED.has(r.action)) flaggedValueCents += r.valueCents;
  }
  return { total, byAction, flaggedValueCents };
}
