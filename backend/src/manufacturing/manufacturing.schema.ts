import { z } from "zod";

/**
 * Validation for the Merchant Manufacturing module (recipes / BOM + production).
 *
 * A batch yields whole units of a finished catalogue product (integer, matching
 * `products.stock`). What it consumes are ingredients — raw materials kept out of
 * the catalogue, measured in g / kg / mL / L / pcs, with decimal amounts.
 */

const positiveInt = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim())))
  .refine((n) => Number.isInteger(n) && n > 0, "Enter a whole number of 1 or more.");

/** An ingredient amount — decimals allowed (1.5 kg), up to 3 places. */
const amount = (label: string, { allowZero }: { allowZero: boolean }) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim())))
    .refine(
      (n) => Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n < 1e11,
      allowZero ? `Enter a valid ${label} (0 or more).` : `Enter a ${label} greater than 0.`,
    )
    .transform((n) => Math.round(n * 1000) / 1000);

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

// ── Ingredients ────────────────────────────────────────────────────────────

/** Measuring units an ingredient is stocked and consumed in. */
export const INGREDIENT_UNITS = ["g", "kg", "mL", "L", "pcs"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const ingredientCreateSchema = z.object({
  name: z.string().trim().min(1, "Name the ingredient.").max(120),
  unit: z.enum(INGREDIENT_UNITS, { errorMap: () => ({ message: "Choose a unit." }) }),
  stock: amount("stock on hand", { allowZero: true }).default(0),
  lowStockThreshold: amount("low-stock alert", { allowZero: true }).default(0),
});

export const ingredientUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name the ingredient.").max(120).optional(),
  unit: z.enum(INGREDIENT_UNITS, { errorMap: () => ({ message: "Choose a unit." }) }).optional(),
  stock: amount("stock on hand", { allowZero: true }).optional(),
  lowStockThreshold: amount("low-stock alert", { allowZero: true }).optional(),
});

/** Restock: ADD this much to what's on hand (a delivery, a market run). */
export const ingredientRestockSchema = z.object({
  qty: amount("quantity", { allowZero: false }),
});

/** "Suggest with AI" request: what to make and how many pieces per batch. */
export const recipeSuggestSchema = z.object({
  product: z.string().trim().min(2, "Name the product, e.g. Pandesal.").max(120),
  piecesPerBatch: positiveInt.refine((n) => n <= 10000, "Keep a batch under 10,000 pieces."),
  notes: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(300).optional(),
  ),
});

export type IngredientCreateInput = z.infer<typeof ingredientCreateSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateSchema>;

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockThreshold: number;
  lowStock: boolean;
  /** How many active recipes use it (deleting it blocks those recipes). */
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Recipes ────────────────────────────────────────────────────────────────

/**
 * A recipe line consumes an ingredient (the normal case). `productId` is the
 * legacy line — a catalogue item used as a component — accepted so a recipe
 * saved before ingredients existed can still be edited without losing lines.
 */
export const recipeComponentSchema = z
  .object({
    ingredientId: uuid.optional(),
    productId: uuid.optional(),
    qty: amount("quantity", { allowZero: false }),
  })
  .refine((c) => !!c.ingredientId !== !!c.productId, "Choose an ingredient for each line.");

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
  ingredientId: string | null;
  /** Legacy: a catalogue product used as a component. */
  productId: string | null;
  name: string;
  /** Measuring unit (g, kg, …); "pcs" for a legacy catalogue component. */
  unit: string;
  qty: number;
  /** Current stock of the ingredient / product (for buildability). */
  stock: number;
  /** False when the ingredient/product it pointed at was deleted. */
  available: boolean;
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
  ingredientId: string | null;
  productId: string | null;
  name: string;
  unit: string;
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
