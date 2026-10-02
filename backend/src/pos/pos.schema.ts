import { z } from "zod";
import { formatPeso } from "../money.js";

/**
 * POS checkout contracts.
 *
 * Critically, the client sends only `{ productId, qty }` per line plus the
 * settlement channel — never prices or a tenant id. The server re-derives every
 * peso figure from the tenant-scoped `products` rows, so a tampered client can
 * neither set its own prices nor reach another Tenant's catalog.
 */
export const PAYMENT_METHODS = ["Cash", "GCash", "Maya", "QRPH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * BIR VAT classification carried by every product (and snapshotted onto each
 * sale line). PH retail prices are VAT-INCLUSIVE, so only VATable lines yield
 * output VAT (portion × 12/112); exempt and zero-rated lines carry none.
 */
export const VAT_CLASSES = ["VATABLE", "EXEMPT", "ZERO_RATED"] as const;
export type VatClass = (typeof VAT_CLASSES)[number];

/** VAT is 12% and PRICE-INCLUSIVE in PH retail, so vat = inclusive × 12/112. */
const VAT_NUM = 12;
const VAT_DEN = 112;

/** The per-class money breakdown of a sale (all integer centavos). */
export interface VatBreakdown {
  /** Output VAT extracted from the VATable portion. */
  vatCents: number;
  /** Net-of-VAT taxable base (the VATable portion minus its VAT). */
  vatableSalesCents: number;
  /** VAT-exempt sales (inclusive = net; no VAT). */
  vatExemptCents: number;
  /** Zero-rated sales (0% VAT). */
  zeroRatedCents: number;
  /** Total net of VAT = vatableSales + exempt + zeroRated. */
  subtotalCents: number;
  /** What was actually charged (gross − discount), VAT-inclusive. */
  netCents: number;
}

/**
 * Pure VAT breakdown (centavos), extracted so checkout and refunds share one
 * tested implementation. Each line carries its VAT class and VAT-inclusive
 * gross; a cart-level `discountCents` is allocated across the three classes in
 * proportion to their gross (so a discount shrinks each class's taxable base
 * fairly). The VATable portion is taken as the residual of the net after the
 * exempt/zero parts, which keeps the three inclusive parts summing to the net
 * EXACTLY — no centavo can leak. VAT is then split out of the VATable portion.
 */
export function computeVatBreakdown(
  lines: { vatClass: VatClass; grossCents: number }[],
  discountCents = 0,
): VatBreakdown {
  const grossOf = (k: VatClass) =>
    lines.reduce((sum, l) => (l.vatClass === k ? sum + l.grossCents : sum), 0);
  const vatableGross = grossOf("VATABLE");
  const exemptGross = grossOf("EXEMPT");
  const zeroGross = grossOf("ZERO_RATED");
  const totalGross = vatableGross + exemptGross + zeroGross;

  const disc = Math.min(Math.max(0, Math.round(discountCents)), totalGross);
  const netCents = totalGross - disc;

  // Exempt/zero each shed their proportional share of the discount (clamped to
  // their own gross). VATable absorbs the rest as the residual of the net, so
  // vatableNetIncl + exempt + zero === netCents by construction.
  const share = (gross: number) =>
    totalGross > 0 ? Math.min(gross, Math.round((disc * gross) / totalGross)) : 0;
  const vatExemptCents = exemptGross - share(exemptGross);
  const zeroRatedCents = zeroGross - share(zeroGross);
  const vatableNetIncl = Math.max(0, netCents - vatExemptCents - zeroRatedCents);

  const vatCents = Math.round((vatableNetIncl * VAT_NUM) / VAT_DEN);
  const vatableSalesCents = vatableNetIncl - vatCents;
  const subtotalCents = vatableSalesCents + vatExemptCents + zeroRatedCents;
  return { vatCents, vatableSalesCents, vatExemptCents, zeroRatedCents, subtotalCents, netCents };
}

export const orderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Invalid product."),
        qty: z.number().int().positive().max(999),
      }),
    )
    .min(1, "The cart is empty."),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: "Choose a payment method." }),
  }),
  // Cash only; ignored for e-wallet rails. Integer centavos.
  tenderedCents: z.number().int().nonnegative().optional(),
  // E-wallet rails: last few digits of the customer's reference code.
  referenceCode: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/, "Reference must be digits.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Cart-level discount. `percent` → value is 0–100; `fixed` → value is centavos.
  discount: z
    .object({
      type: z.enum(["percent", "fixed"]),
      value: z.number().nonnegative(),
      label: z.string().trim().max(40).optional(),
    })
    .optional(),
  // Optional CRM customer to attach to the sale (loyalty accrues to them). The
  // server verifies the id belongs to this tenant before linking.
  customerId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Optional loyalty redemption: whole points the attached customer spends at
  // checkout (1 pt = ₱1 off). The server clamps this to the live balance and to
  // the remaining payable before applying it as a discount, then deducts it.
  redeemPoints: z.number().int().nonnegative().max(10_000_000).optional(),
});

export type OrderInput = z.infer<typeof orderSchema>;

/** API-facing catalog shapes (camelCase, money in centavos). */
export interface CatalogProduct {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  priceCents: number;
  stock: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  vatClass: VatClass;
}

export interface CatalogCategory {
  id: string;
  name: string;
}

/** The e-wallet rails that can carry an owner-uploaded scan-to-pay QR. */
export type EwalletQrMethod = "GCash" | "Maya" | "QRPH";
/** Owner-uploaded checkout QR image URLs by method (null when none uploaded). */
export type PaymentQrMap = Record<EwalletQrMethod, string | null>;

/** Store identity + receipt config, surfaced for the printed ticket. */
export interface StoreBrand {
  name: string;
  slug: string | null;
  address: string | null;
  phone: string | null;
  tin: string | null;
  /** BIR "Business Style" — the store's trade name / line of business. */
  businessStyle: string | null;
  vatLabel: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  /** Logo URL for the receipt, or null when the owner hid it. */
  logoUrl: string | null;
  /** BIR machine-accreditation footer (Permit to Use / Machine ID / Serial). */
  ptu: string | null;
  min: string | null;
  serial: string | null;
}

export interface Catalog {
  store: StoreBrand;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  /** Owner-uploaded e-wallet QR codes shown to customers at checkout. */
  paymentQrs: PaymentQrMap;
}

export interface Sale {
  id: string;
  reference: string;
  subtotalCents: number;
  vatCents: number;
  /** Net-of-VAT taxable base (the VATable portion minus its VAT). */
  vatableSalesCents: number;
  /** VAT-exempt sales on this ticket (centavos). */
  vatExemptCents: number;
  /** Zero-rated sales on this ticket (centavos). */
  zeroRatedCents: number;
  /** Gross of items before any discount. */
  grossCents: number;
  discountCents: number;
  discountLabel: string | null;
  /** Net payable (gross − discount); equals what was charged. */
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentRef: string | null;
  tenderedCents: number | null;
  changeCents: number | null;
  /** Loyalty points credited to the attached customer for this sale. */
  pointsEarned: number;
  /** Loyalty points the customer spent on this sale (1 pt = ₱1 discount). */
  pointsRedeemed: number;
  createdAt: string;
}

/** A cashier profile shown in the terminal switch selector (no PIN exposed). */
export interface CashierProfile {
  id: string;
  name: string;
}

// ── Shift reconciliation (X-Read / Z-Read) ──────────────────────────────────

/** Open a shift by recording the baseline change in the drawer (pesos → cents). */
export const shiftOpenSchema = z.object({
  openingCents: z.number().int().nonnegative().max(100_000_00, "That opening float looks too large."),
});
export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

/** Close a shift by keying the physical cash drawer count (pesos → cents). */
export const shiftCloseSchema = z.object({
  countedCents: z.number().int().nonnegative().max(100_000_00, "That counted amount looks too large."),
  note: z.string().trim().max(280).optional(),
});
export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

/** Per-channel running tallies for a shift, derived from stamped sales. */
export interface ShiftTally {
  cashSalesCents: number;
  ewalletSalesCents: number;
  cardSalesCents: number;
  totalSalesCents: number;
  txnCount: number;
}

/** The live (open) shift the till is operating under, with running tallies. */
export interface ActiveShift extends ShiftTally {
  id: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  /** opening float + cash sales so far — what the drawer should hold. */
  expectedCashCents: number;
}

/** The frozen Z-Read audit summary returned after a shift is reconciled. */
export interface ShiftZRead extends ShiftTally {
  id: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  closedAt: string;
  expectedCashCents: number;
  countedCashCents: number;
  /** counted − expected: positive = overage, negative = shortage. */
  cashVarianceCents: number;
  note: string | null;
  /** Immutable, human-readable reconciliation line frozen at close. */
  auditSnapshot: string;
}

/**
 * Pure reconciliation maths (centavos), extracted so it can be unit-tested
 * without a database. Expected cash is the opening float plus cash sales; the
 * variance is the physical count minus that expectation.
 */
export function reconcile(
  openingCents: number,
  cashSalesCents: number,
  countedCents: number,
): { expectedCashCents: number; cashVarianceCents: number } {
  const expectedCashCents = openingCents + cashSalesCents;
  return { expectedCashCents, cashVarianceCents: countedCents - expectedCashCents };
}

/** The reconciled shift figures that compose the frozen Z-Read audit line. */
export interface ShiftAuditInput {
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingCents: number;
  cashSalesCents: number;
  ewalletSalesCents: number;
  cardSalesCents: number;
  totalSalesCents: number;
  txnCount: number;
  expectedCashCents: number;
  countedCashCents: number;
  cashVarianceCents: number;
  note: string | null;
}

/**
 * Build the immutable, human-readable audit snapshot frozen into the shift row
 * at Z-Read. It states the expected-vs-counted reconciliation to the exact
 * centavo — so an owner reviewing the ledger reads the outcome without
 * recomputing it. Pure (no DB), unit-tested alongside reconcile(). Every peso
 * figure derives from integer centavos via formatPeso, never floats.
 */
export function buildAuditSnapshot(input: ShiftAuditInput): string {
  const variance =
    input.cashVarianceCents === 0
      ? `BALANCED ${formatPeso(0)}`
      : input.cashVarianceCents > 0
        ? `OVERAGE +${formatPeso(input.cashVarianceCents)}`
        : `SHORTAGE -${formatPeso(Math.abs(input.cashVarianceCents))}`;
  const parts = [
    `Z-READ · ${input.cashierName}`,
    `opened ${input.openedAt}`,
    `closed ${input.closedAt}`,
    `opening ${formatPeso(input.openingCents)}`,
    `cash sales ${formatPeso(input.cashSalesCents)}`,
    `expected drawer ${formatPeso(input.expectedCashCents)}`,
    `counted ${formatPeso(input.countedCashCents)}`,
    `variance ${variance}`,
    `e-wallet ${formatPeso(input.ewalletSalesCents)}`,
    `card ${formatPeso(input.cardSalesCents)}`,
    `total ${formatPeso(input.totalSalesCents)} (${input.txnCount} txn${input.txnCount === 1 ? "" : "s"})`,
  ];
  if (input.note) parts.push(`note: ${input.note}`);
  return parts.join(" | ");
}
