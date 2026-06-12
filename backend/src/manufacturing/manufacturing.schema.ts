import { z } from "zod";

/**
 * Validation for the Merchant Manufacturing module (recipes / BOM + production).
 *
 * Quantities are integer units throughout, matching the integer `products.stock`
 * model — a component consumes whole units of a catalogue product per batch, and
 * a batch yields whole units of the finished good.
 */

const positiveInt = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isInteger(n) && n > 0, "Enter a whole number of 1 or more.");

const uuid = z.string().trim().uuid("Choose a valid product.");

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const booleanField = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

// ── Recipes ────────────────────────────────────────────────────────────────

export const recipeComponentSchema = z.object({
  productId: uuid,
  qty: positiveInt,
});

export const recipeCreateSchema = z.object({
  productId: uuid,
  outputQty: positiveInt.default(1),
  note: optionalText(500),
  isActive: booleanField,
  components: z.array(recipeComponentSchema).min(1, "Add at least one component."),
});

/** Update: header fields optional; if `components` is present it replaces all. */
export const recipeUpdateSchema = z.object({
  productId: uuid.optional(),
  outputQty: positiveInt.optional(),
  note: optionalText(500),
  isActive: booleanField,
  components: z.array(recipeComponentSchema).min(1, "Add at least one component.").optional(),
});

export const produceSchema = z.object({
  batches: positiveInt.default(1),
  note: optionalText(500),
});

export type RecipeComponentInput = z.infer<typeof recipeComponentSchema>;
export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type ProduceInput = z.infer<typeof produceSchema>;

// ── API-facing shapes ─────────────────────────────────────────────────────────

export interface RecipeComponent {
  id: string;
  productId: string | null;
  name: string;
  qty: number;
  /** Current catalogue stock of this component (for buildability). */
  stock: number;
}

export interface Recipe {
  id: string;
  productId: string | null;
  productName: string;
  outputQty: number;
  note: string | null;
  isActive: boolean;
  components: RecipeComponent[];
  /** Derived: how many full batches current stock allows (0 if blocked). */
  maxBatches: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionRunItem {
  id: string;
  productId: string | null;
  name: string;
  qtyConsumed: number;
}

export interface ProductionRunSummary {
  id: string;
  reference: string;
  recipeId: string | null;
  productId: string | null;
  productName: string;
  batches: number;
  outputQty: number;
  createdAt: string;
}

export interface ProductionRunDetail extends ProductionRunSummary {
  note: string | null;
  items: ProductionRunItem[];
}
