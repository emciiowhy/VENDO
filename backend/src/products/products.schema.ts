import { z } from "zod";

/**
 * Validation for the Merchant Inventory & Category CRUD Matrix.
 *
 * Product create/update payloads arrive as multipart form fields (so an image
 * file can ride along), which means every value is a string on the wire. The
 * schemas below coerce those strings into the right types and normalise money
 * to integer centavos before it reaches the repository.
 */

/** Pesos (e.g. "154.50") → integer centavos (15450). */
const pesosToCents = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[₱,\s]/g, ""))))
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid price.")
  .transform((n) => Math.round(n * 100));

/** Multipart fields arrive as strings; coerce to a non-negative integer. */
const intField = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
    .refine((n) => Number.isInteger(n) && n >= 0, `Enter a valid ${label}.`);

// Absent (key omitted) → undefined → "leave unchanged" on update.
// Empty string → null → "clear" (uncategorised / no parent).
// A UUID → that id.
const optionalUuid = z
  .union([
    z.literal("").transform(() => null),
    z.string().trim().uuid("Choose a valid category."),
  ])
  .optional();

const booleanField = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "Product name is required.").max(160),
  // Optional. A blank (or whitespace-only) SKU must normalise to `undefined` so
  // the repository persists NULL — the partial unique index
  // `products_tenant_sku_key` (… WHERE sku IS NOT NULL) only allows multiple
  // SKU-less products when they're NULL; an empty string '' falls *inside* the
  // index and the 2nd such product trips "A product with that SKU already
  // exists." The earlier `.optional().or("" → undefined)` never fired because
  // `.optional()` already accepts "" as a valid string, so the `.or()` was dead.
  sku: z
    .string()
    .trim()
    .max(64, "SKU must be 64 characters or fewer.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  categoryId: optionalUuid,
  // Wire value is pesos (e.g. "154.50"); after parse this holds integer centavos.
  price: pesosToCents,
  stock: intField("stock quantity"),
  lowStockThreshold: intField("low-stock threshold"),
  isActive: booleanField,
});

/** Update: every field optional, but at least the shape is validated. */
export const productUpdateSchema = productCreateSchema.partial();

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Category name is required.").max(80),
  parentId: optionalUuid,
  sortOrder: intField("sort order").optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

/** API-facing shapes (camelCase, money exposed as both cents and a peso number). */
export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string | null;
  priceCents: number;
  price: number;
  stock: number;
  lowStockThreshold: number;
  /** Derived: stock at or below the configured threshold. */
  lowStock: boolean;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
