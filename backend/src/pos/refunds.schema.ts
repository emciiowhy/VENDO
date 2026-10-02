import { z } from "zod";
import { computeVatBreakdown, type VatClass } from "./pos.schema.js";

/**
 * Void / Return request contracts. As with checkout, the client never sends
 * money — only which sale (path param) and, for a return, which lines and how
 * many units. Every peso of the refund is re-derived server-side from the
 * original sale's snapshotted prices.
 */

export interface RefundFigures {
  /** The returned items' share of the original cart discount. */
  discountShareCents: number;
  /** Net refunded (returned gross − discount share) — what goes back to the customer. */
  refundNetCents: number;
  refundVatCents: number;
  refundSubtotalCents: number;
  /** Per-class breakdown of the refunded net (mirrors the sale's VAT summary). */
  refundVatableSalesCents: number;
  refundVatExemptCents: number;
  refundZeroRatedCents: number;
}

/**
 * Pure refund maths (centavos), extracted so it can be unit-tested without a
 * database. The returned items' gross is reduced by their PROPORTIONAL share of
 * the sale's cart discount (so partial returns can't claw back more discount
 * than they carried), then the net is split across VAT classes and VAT extracted
 * from the VATable portion only — exactly as checkout booked it (via the shared
 * `computeVatBreakdown`). Everything is integer centavos, never floats.
 */
export function computeRefund(p: {
  returnedLines: { vatClass: VatClass; grossCents: number }[];
  originalTotalCents: number;
  originalDiscountCents: number;
}): RefundFigures {
  const returnedGross = p.returnedLines.reduce((sum, l) => sum + l.grossCents, 0);
  const originalGross = p.originalTotalCents + p.originalDiscountCents;
  const discountShareCents =
    p.originalDiscountCents > 0 && originalGross > 0
      ? Math.round((p.originalDiscountCents * returnedGross) / originalGross)
      : 0;
  const b = computeVatBreakdown(p.returnedLines, discountShareCents);
  return {
    discountShareCents,
    refundNetCents: b.netCents,
    refundVatCents: b.vatCents,
    refundSubtotalCents: b.subtotalCents,
    refundVatableSalesCents: b.vatableSalesCents,
    refundVatExemptCents: b.vatExemptCents,
    refundZeroRatedCents: b.zeroRatedCents,
  };
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
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
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
  vatClass: VatClass;
}

/** Full sale detail for the void/return screen (and receipt reprint). */
export interface SaleDetail {
  id: string;
  reference: string;
  status: "completed" | "voided" | "partially_returned" | "returned";
  subtotalCents: number;
  vatCents: number;
  vatableSalesCents: number;
  vatExemptCents: number;
  zeroRatedCents: number;
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
