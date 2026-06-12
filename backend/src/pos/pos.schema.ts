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
}

export interface CatalogCategory {
  id: string;
  name: string;
}

/** The e-wallet rails that can carry an owner-uploaded scan-to-pay QR. */
export type EwalletQrMethod = "GCash" | "Maya" | "QRPH";
/** Owner-uploaded checkout QR image URLs by method (null when none uploaded). */
export type PaymentQrMap = Record<EwalletQrMethod, string | null>;

export interface Catalog {
  store: { name: string; slug: string | null };
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
