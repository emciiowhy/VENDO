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

/** The fully-derived Senior/PWD settlement (all integer centavos). */
export interface SeniorPwdResult {
  /** Per-class VAT summary of the amount actually charged (VAT is always 0). */
  breakdown: VatBreakdown;
  /** VAT-inclusive gross the items rang up to (unchanged by the benefit). */
  grossInclCents: number;
  /** The 12% output VAT stripped out because the sale is VAT-exempt. */
  vatExemptedCents: number;
  /** The 20% statutory discount, taken on the net-of-VAT base. */
  seniorDiscountCents: number;
  /**
   * What we persist in `sales.discount_cents`: the removed VAT + the 20% (+ any
   * extra). Bundling them keeps the system-wide invariant `gross = total +
   * discount`, which every report and the refund engine rely on when they
   * reconstruct gross as `total_cents + discount_cents`.
   */
  discountCents: number;
  /** Net payable (grossIncl − discountCents) — what the customer pays. */
  totalDueCents: number;
}

/**
 * BIR Senior Citizen / PWD benefit (RA 9994 / RA 10754). The qualified purchase
 * is VAT-EXEMPT: the 12% output VAT is first stripped from each VATable line
 * (reclassifying it to exempt at its net-of-VAT value), and THEN a 20% discount
 * is taken against that net-of-VAT base — never the other way round. This is the
 * fix for the old flat "20% off the VAT-inclusive price", which both overcharged
 * and left VAT on an exempt sale.
 *
 * Already-exempt and zero-rated lines keep their value (no VAT to remove) but
 * still earn the 20% (whole-cart treatment — shared-bill proration is out of
 * scope). `extraDiscountCents` folds in any further reduction (e.g. a loyalty
 * redemption) on top of the 20%, clamped so the net can't fall below zero.
 *
 * Pure (no DB), unit-tested alongside computeVatBreakdown, which it reuses for
 * the final per-class split so there is one tested VAT implementation.
 */
export function computeSeniorPwdBreakdown(
  lines: { vatClass: VatClass; grossCents: number }[],
  extraDiscountCents = 0,
): SeniorPwdResult {
  const grossInclCents = lines.reduce((s, l) => s + l.grossCents, 0);
  // Strip 12% from each VATable line; it becomes exempt at its net-of-VAT value.
  const netLines = lines.map((l) => {
    if (l.vatClass !== "VATABLE") return l;
    const vat = Math.round((l.grossCents * VAT_NUM) / VAT_DEN);
    return { vatClass: "EXEMPT" as VatClass, grossCents: l.grossCents - vat };
  });
  const netBaseCents = netLines.reduce((s, l) => s + l.grossCents, 0);
  const vatExemptedCents = grossInclCents - netBaseCents;
  const seniorDiscountCents = Math.round((netBaseCents * 20) / 100);
  const extra = Math.min(
    Math.max(0, Math.round(extraDiscountCents)),
    Math.max(0, netBaseCents - seniorDiscountCents),
  );
  const appliedDiscount = seniorDiscountCents + extra;
  const breakdown = computeVatBreakdown(netLines, appliedDiscount);
  const totalDueCents = breakdown.netCents;
  const discountCents = vatExemptedCents + appliedDiscount; // = grossIncl − totalDue
  return {
    breakdown,
    grossInclCents,
    vatExemptedCents,
    seniorDiscountCents,
    discountCents,
    totalDueCents,
  };
}

/**
 * The only discounts a till may apply. Every one is predefined — the cashier
 * picks a category, never an amount:
 *   senior / pwd — the statutory benefit (computeSeniorPwdBreakdown), on the
 *                  benefit-eligible lines only;
 *   member       — the owner's loyalty member % (CRM → Discounts);
 *   promo        — an owner-defined promotion, looked up by id server-side.
 * Exactly one per sale: RA 9994 / RA 10754 bar stacking the 20% with another
 * promo, and the discriminated union makes a second discount unrepresentable.
 */
export type CartDiscount =
  | { kind: "senior" | "pwd" }
  | { kind: "member"; pct: number }
  | { kind: "promo"; name: string; promoKind: "percent" | "fixed"; value: number };

/** An owner-defined promotion as the till sees it (value: % or centavos). */
export interface Promotion {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
}

/** Centavos a percent/fixed reduction takes off `grossCents` (never above it). */
function reductionCents(grossCents: number, kind: "percent" | "fixed", value: number): number {
  if (kind === "percent") return Math.round((grossCents * Math.min(100, Math.max(0, value))) / 100);
  return Math.min(grossCents, Math.max(0, Math.round(value)));
}

export interface PriceCartInput {
  lines: { vatClass: VatClass; grossCents: number; scPwdEligible: boolean }[];
  /**
   * False for a NON-VAT store: every line is treated as carrying no VAT, so the
   * sale books ₱0 VAT and Senior/PWD is a plain 20% off (there's no VAT to
   * remove). Defaults to true.
   */
  vatRegistered?: boolean;
  discount: CartDiscount | null;
  /** Points the cashier asked to redeem (clamped below). */
  requestedPoints: number;
  /** The attached customer's live balance (0 with no customer). */
  pointsBalance: number;
  /** What one point is worth, in centavos (tenants.loyalty_point_value_cents). */
  pointValueCents: number;
}

export interface PricedCart extends VatBreakdown {
  grossCents: number;
  /** gross − net: every reduction (removed VAT, 20%, member %, points). */
  discountCents: number;
  pointsRedeemed: number;
  /** Lines the Senior/PWD benefit actually covered (0 for other discounts). */
  eligibleLineCount: number;
}

/**
 * Price a cart — the single source of truth for what a sale charges. Pure and
 * integer-centavo, so checkout and the register's preview mirror (frontend
 * lib/pos.ts, held to this by frontendParity.test.ts) can never disagree.
 *
 * Senior/PWD: eligible lines go through computeSeniorPwdBreakdown (VAT stripped,
 * then 20%); ineligible lines are charged normally, VAT intact. Member: the % is
 * taken off the whole gross. Points then come off what is still payable — capped
 * at the balance and at the payable — split pro-rata between the benefit and
 * non-benefit parts so neither part's VAT base goes negative.
 */
export function priceCart(raw: PriceCartInput): PricedCart {
  const input: PriceCartInput =
    raw.vatRegistered === false
      ? { ...raw, lines: raw.lines.map((l) => ({ ...l, vatClass: "EXEMPT" as VatClass })) }
      : raw;
  const grossCents = input.lines.reduce((s, l) => s + l.grossCents, 0);
  const pointValue = Math.max(1, Math.round(input.pointValueCents));
  const clampPoints = (payable: number) =>
    Math.max(
      0,
      Math.min(
        Math.floor(input.requestedPoints),
        Math.floor(input.pointsBalance),
        Math.floor(payable / pointValue),
      ),
    );
  const sum = (a: VatBreakdown, b: VatBreakdown): VatBreakdown => ({
    vatCents: a.vatCents + b.vatCents,
    vatableSalesCents: a.vatableSalesCents + b.vatableSalesCents,
    vatExemptCents: a.vatExemptCents + b.vatExemptCents,
    zeroRatedCents: a.zeroRatedCents + b.zeroRatedCents,
    subtotalCents: a.subtotalCents + b.subtotalCents,
    netCents: a.netCents + b.netCents,
  });

  const d = input.discount;
  if (d && (d.kind === "senior" || d.kind === "pwd")) {
    const eligible = input.lines.filter((l) => l.scPwdEligible);
    const other = input.lines.filter((l) => !l.scPwdEligible);
    const benefit = computeSeniorPwdBreakdown(eligible);
    const otherGross = other.reduce((s, l) => s + l.grossCents, 0);
    const pointsRedeemed = clampPoints(benefit.totalDueCents + otherGross);
    const extra = pointsRedeemed * pointValue;
    const totalPayable = benefit.totalDueCents + otherGross;
    let extraBenefit =
      totalPayable > 0 ? Math.round((extra * benefit.totalDueCents) / totalPayable) : 0;
    extraBenefit = Math.min(extraBenefit, benefit.totalDueCents);
    const extraOther = Math.min(extra - extraBenefit, otherGross);
    extraBenefit = extra - extraOther; // any rounding remainder lands where it fits
    const b1 =
      extraBenefit > 0 ? computeSeniorPwdBreakdown(eligible, extraBenefit).breakdown : benefit.breakdown;
    const b2 = computeVatBreakdown(other, extraOther);
    const breakdown = sum(b1, b2);
    return {
      ...breakdown,
      grossCents,
      discountCents: grossCents - breakdown.netCents,
      pointsRedeemed,
      eligibleLineCount: eligible.length,
    };
  }

  const offCents =
    d?.kind === "member"
      ? reductionCents(grossCents, "percent", d.pct)
      : d?.kind === "promo"
        ? reductionCents(grossCents, d.promoKind, d.value)
        : 0;
  const pointsRedeemed = clampPoints(grossCents - offCents);
  const breakdown = computeVatBreakdown(input.lines, offCents + pointsRedeemed * pointValue);
  return {
    ...breakdown,
    grossCents,
    discountCents: grossCents - breakdown.netCents,
    pointsRedeemed,
    eligibleLineCount: 0,
  };
}

/** Receipt label for a priced sale (e.g. "Senior Citizen (20% + VAT-exempt) + 5 pts"). */
export function discountLabelFor(
  discount: CartDiscount | null,
  pointsRedeemed: number,
  vatRegistered = true,
): string | null {
  let label: string | null = null;
  // A non-VAT store has no VAT to exempt — the benefit is a plain 20% off.
  const benefit = vatRegistered ? "(20% + VAT-exempt)" : "(20% off)";
  if (discount?.kind === "senior") label = `Senior Citizen ${benefit}`;
  else if (discount?.kind === "pwd") label = `PWD ${benefit}`;
  else if (discount?.kind === "member") label = `Member ${discount.pct}% off`;
  else if (discount?.kind === "promo") label = discount.name;
  if (pointsRedeemed > 0) {
    const pts = `${pointsRedeemed} pt${pointsRedeemed === 1 ? "" : "s"} redeemed`;
    label = label ? `${label} + ${pts}` : pts;
  }
  return label;
}

const scPwdFields = {
  idNumber: z.string().trim().min(1, "Enter the ID number.").max(40),
  holderName: z.string().trim().min(1, "Enter the cardholder's name.").max(80),
  // RA 9994 / RA 10754: the benefit covers the cardholder's own purchase only.
  exclusiveUse: z.literal(true, {
    errorMap: () => ({ message: "Confirm the purchase is for the cardholder's exclusive use." }),
  }),
};

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
  // Cart-level discount — a predefined CATEGORY only, never an amount (see
  // CartDiscount). Senior/PWD carry the BIR-required ID number + cardholder name;
  // `member` carries nothing, the % is read from the tenant's CRM settings. The
  // old free-form `percent` / `fixed` shapes are rejected (400).
  discount: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("senior"), ...scPwdFields }),
      z.object({ type: z.literal("pwd"), ...scPwdFields }),
      z.object({ type: z.literal("member") }),
      // Only the promo's id — its amount is read from the owner's promotions.
      z.object({ type: z.literal("promo"), promoId: z.string().uuid("Invalid promo.") }),
    ])
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
  /** Whether the Senior/PWD benefit covers this item. */
  scPwdEligible: boolean;
}

/** The tenant's discount rules, surfaced so the register can preview totals. */
export interface PricingSettings {
  pointValueCents: number;
  pesosPerPoint: number;
  /** 0 = member discount off. */
  memberDiscountPct: number;
  memberMinSpendCents: number;
  /** False for a non-VAT store (no VAT shown or booked). */
  vatRegistered: boolean;
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
  /** False for a non-VAT store: receipts say NON-VAT and show no VAT lines. */
  vatRegistered: boolean;
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
  pricing: PricingSettings;
  /** The owner's ACTIVE promotions — tap-only buttons at the till. */
  promotions: Promotion[];
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
  /** BIR Senior/PWD ID number recorded for a VAT-exempt benefit sale (else null). */
  scPwdIdNumber: string | null;
  /** The Senior/PWD cardholder's name recorded on the sale (else null). */
  scPwdName: string | null;
  /** Which statutory category was applied (null = none / legacy sale). */
  scPwdType: "senior" | "pwd" | null;
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
