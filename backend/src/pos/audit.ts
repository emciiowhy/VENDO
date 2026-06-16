import { z } from "zod";

/**
 * POS terminal audit telemetry — the pure contracts + summary maths.
 *
 * The shop floor raises an audit event for the sensitive LIVE-terminal actions
 * that never reach the sales ledger: voiding a line out of the open cart,
 * cancelling a transaction mid-ring before payment, or popping the cash drawer
 * with no sale. These are recorded immutably so the owner can review unauthorised
 * cashier activity (a prime source of stock/cash shrinkage). The DB write lives
 * in audit.repository.ts; the rollup maths here are pure so they can be
 * unit-tested without a database (see audit.test.ts).
 */

/** The sensitive terminal actions worth auditing. */
export const AUDIT_ACTIONS = ["void_item", "cancel_transaction", "open_drawer"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** What a terminal posts when one of those actions fires (camelCase, centavos). */
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

/** A recorded audit row as the API hands it back (money in centavos). */
export interface AuditLog {
  id: string;
  cashierUserId: string | null;
  cashierName: string;
  action: AuditAction;
  itemName: string | null;
  itemQty: number | null;
  valueCents: number;
  detail: string | null;
  createdAt: string;
}

/** Human-readable label for an action, used in the owner's audit table. */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  void_item: "Item voided from cart",
  cancel_transaction: "Transaction cancelled",
  open_drawer: "Cash drawer opened (no sale)",
};

/** The owner-facing rollup over a set of audit rows. */
export interface AuditSummary {
  total: number;
  byAction: Record<AuditAction, number>;
  /** Total peso value implicated by voids + cancels (centavos). */
  flaggedValueCents: number;
}

/**
 * Summarise a window of audit rows for the owner's dashboard: a per-action tally
 * and the total peso value implicated by voids and cancellations (drawer pops
 * carry no value). Pure — fed real rows by the router, exercised directly by the
 * unit tests.
 */
export function summarizeAudit(rows: Pick<AuditLog, "action" | "valueCents">[]): AuditSummary {
  const byAction: Record<AuditAction, number> = {
    void_item: 0,
    cancel_transaction: 0,
    open_drawer: 0,
  };
  let flaggedValueCents = 0;
  for (const r of rows) {
    byAction[r.action] += 1;
    if (r.action !== "open_drawer") flaggedValueCents += r.valueCents;
  }
  return { total: rows.length, byAction, flaggedValueCents };
}
