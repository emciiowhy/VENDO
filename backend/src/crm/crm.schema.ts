import { z } from "zod";

/**
 * Validation for the Merchant CRM module (customers + loyalty).
 *
 * Customer purchase history and lifetime spend are derived live from `sales`
 * (linked via `sales.customer_id`), so this module mostly governs the customer
 * book itself. Tags are a simple string list.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().email("Enter a valid email.").max(160).optional(),
);

const booleanField = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

const tagsField = z
  .array(z.string().trim().min(1).max(40))
  .max(12, "Up to 12 tags.")
  .optional()
  .transform((v) => (v ? [...new Set(v.map((t) => t.trim()).filter(Boolean))] : v));

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(160),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(240),
  tags: tagsField,
  note: optionalText(500),
  isActive: booleanField,
});

export const customerUpdateSchema = customerCreateSchema.partial();

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

// ── API-facing shapes ─────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tags: string[];
  note: string | null;
  loyaltyPoints: number;
  isActive: boolean;
  /** Derived lifetime stats from sales. */
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A past sale attached to a customer (for the history panel). */
export interface CustomerSale {
  id: string;
  reference: string;
  totalCents: number;
  paymentMethod: string;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  recentSales: CustomerSale[];
}

/** Lightweight shape for the POS customer picker. */
export interface CustomerLite {
  id: string;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}
