import { z } from "zod";

/**
 * Void / Return request contracts. As with checkout, the client never sends
 * money — only which sale (path param) and, for a return, which lines and how
 * many units. Every peso of the refund is re-derived server-side from the
 * original sale's snapshotted prices.
 */

/** VAT is 12% and PRICE-INCLUSIVE, so vat = net × 12/112 (mirrors checkout). */
const VAT_NUM = 12;
const VAT_DEN = 112;

export interface RefundFigures {
  /** The returned items' share of the original cart discount. */
  discountShareCents: number;
  /** Net refunded (returned gross − discount share) — what goes back to the customer. */
  refundNetCents: number;
  refundVatCents: number;
  refundSubtotalCents: number;
}

/**
 * Pure refund maths (centavos), extracted so it can be unit-tested without a
 * database. The returned items' gross is reduced by their PROPORTIONAL share of
 * the sale's cart discount (so partial returns can't claw back more discount
 * than they carried), then VAT is split out of the net exactly as checkout
 * booked it. Everything is integer centavos via Math.round, never floats.
 */
export function computeRefund(p: {
  returnedGrossCents: number;
  originalTotalCents: number;
  originalDiscountCents: number;
}): RefundFigures {
  const originalGross = p.originalTotalCents + p.originalDiscountCents;
  const discountShareCents =
    p.originalDiscountCents > 0 && originalGross > 0
      ? Math.round((p.originalDiscountCents * p.returnedGrossCents) / originalGross)
      : 0;
  const refundNetCents = p.returnedGrossCents - discountShareCents;
  const refundVatCents = Math.round((refundNetCents * VAT_NUM) / VAT_DEN);
  const refundSubtotalCents = refundNetCents - refundVatCents;
  return { discountShareCents, refundNetCents, refundVatCents, refundSubtotalCents };
}

/** Void the whole sale. An optional reason is recorded for the audit trail. */
export const voidSchema = z.object({
  reason: z.string().trim().max(280).optional(),
});
export type VoidInput = z.infer<typeof voidSchema>;

/** Return specific lines/quantities of a sale (partial or, summed, full). */
export const returnSchema = z.object({
  lines: z
    .array(
      z.object({
        saleItemId: z.string().uuid("Invalid line."),
        qty: z.number().int().positive().max(999),
      }),
    )
    .min(1, "Choose at least one item to return."),
  reason: z.string().trim().max(280).optional(),
});
export type ReturnInput = z.infer<typeof returnSchema>;

// ── API shapes ────────────────────────────────────────────────────────────────

/** A reversal (void/return) result — the negative contra sale that was written. */
export interface Reversal {
  id: string;
  reference: string;
  kind: "void" | "return";
  /** Negative figures: what was taken back off the books. */
  subtotalCents: number;
  vatCents: number;
  discountCents: number;
  totalCents: number;
  paymentMethod: string;
  reason: string | null;
  createdAt: string;
  /** The original sale's new lifecycle status after this reversal. */
  originalStatus: "voided" | "partially_returned" | "returned";
}

/** A sale line with how much of it remains eligible to return. */
export interface SaleLineDetail {
  saleItemId: string;
  productId: string | null;
  name: string;
  unitPriceCents: number;
  qty: number;
  returnedQty: number;
  returnableQty: number;
}

/** Full sale detail for the void/return screen (and receipt reprint). */
export interface SaleDetail {
  id: string;
  reference: string;
  status: "completed" | "voided" | "partially_returned" | "returned";
  subtotalCents: number;
  vatCents: number;
  discountCents: number;
  discountLabel: string | null;
  /** Gross of items before discount (= total + discount). */
  grossCents: number;
  totalCents: number;
  paymentMethod: string;
  paymentRef: string | null;
  tenderedCents: number | null;
  changeCents: number | null;
  cashierName: string | null;
  customerName: string | null;
  createdAt: string;
  lines: SaleLineDetail[];
}

/** A row in the recent-sales picker. */
export interface SaleSummary {
  id: string;
  reference: string;
  status: SaleDetail["status"];
  totalCents: number;
  paymentMethod: string;
  cashierName: string | null;
  createdAt: string;
}
