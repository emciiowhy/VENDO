import { z } from "zod";

/**
 * Validation for the Merchant Procurement module (suppliers + purchase orders).
 *
 * Payloads arrive as JSON. Money is accepted as a peso number/string and
 * normalised to integer centavos before it reaches the repository — the same
 * money discipline used across Inventory, the POS and Finance.
 */

/** Pesos (e.g. "1,500.00") → integer centavos (150000). */
const pesosToCents = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[₱,\s]/g, ""))))
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid amount.")
  .transform((n) => Math.round(n * 100));

/** A positive whole quantity. */
const positiveInt = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isInteger(n) && n > 0, "Enter a quantity of 1 or more.");

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD).")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date.");

/** Empty/whitespace strings collapse to undefined ("not provided" → NULL). */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().email("Enter a valid email.").max(160).optional(),
);

// Absent/empty → null; a UUID → that id.
const optionalUuid = z
  .union([
    z.literal("").transform(() => null),
    z.string().trim().uuid("Choose a valid option."),
  ])
  .optional();

function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// ── Suppliers ────────────────────────────────────────────────────────────────

const booleanField = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

export const supplierCreateSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required.").max(160),
  contactName: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  address: optionalText(240),
  note: optionalText(500),
  isActive: booleanField,
});

export const supplierUpdateSchema = supplierCreateSchema.partial();

// ── Purchase orders ──────────────────────────────────────────────────────────

export const poItemSchema = z.object({
  productId: optionalUuid,
  name: z.string().trim().min(1, "Item name is required.").max(160),
  qty: positiveInt,
  unitCost: pesosToCents,
});

export const poCreateSchema = z.object({
  supplierId: optionalUuid,
  status: z.enum(["draft", "ordered"]).default("ordered"),
  orderDate: isoDate.default(todayIso()),
  expectedDate: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    isoDate.optional(),
  ),
  note: optionalText(500),
  items: z.array(poItemSchema).min(1, "Add at least one item to the order."),
});

/** Status transitions the client may request directly (receive is its own route). */
export const poStatusSchema = z.object({
  status: z.enum(["draft", "ordered", "cancelled"]),
});

export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PoItemInput = z.infer<typeof poItemSchema>;
export type PoCreateInput = z.infer<typeof poCreateSchema>;
export type PoStatusInput = z.infer<typeof poStatusSchema>;

// ── API-facing shapes ─────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  unitCostCents: number;
  unitCost: number;
  lineTotalCents: number;
}

/** Row shape for the PO list (no line items, but a roll-up count). */
export interface PurchaseOrderSummary {
  id: string;
  reference: string;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  receivedAt: string | null;
  totalCents: number;
  itemCount: number;
  createdAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrderSummary {
  note: string | null;
  items: PurchaseOrderItem[];
}
