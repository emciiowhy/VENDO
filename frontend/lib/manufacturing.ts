/**
 * Client for the Merchant Manufacturing module (`/api/v1/manufacturing/*`) —
 * ingredients, recipes (BOM) + production. Ingredients are raw materials kept
 * out of Inventory with their own stock; producing consumes them and increments
 * the finished good's Inventory stock, server-side and atomically. Tenant scope
 * is enforced from the session cookie; every call rides with `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/manufacturing`;

/** Measuring units — kept in sync with manufacturing.schema.ts. */
export const INGREDIENT_UNITS = ["g", "kg", "mL", "L", "pcs"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const UNIT_LABEL: Record<string, string> = {
  g: "grams",
  kg: "kilograms",
  mL: "milliliters",
  L: "liters",
  pcs: "pieces",
};

/** "1,500" / "7.5" — amounts up to 3 decimals, no trailing zeros. */
export function formatAmount(n: number): string {
  return n.toLocaleString("en-PH", { maximumFractionDigits: 3 });
}

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockThreshold: number;
  lowStock: boolean;
  recipeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IngredientFields {
  name: string;
  unit: string;
  stock: string;
  lowStockThreshold: string;
}

export interface RecipeComponent {
  id: string;
  ingredientId: string | null;
  /** Legacy: an Inventory product used as a component. */
  productId: string | null;
  name: string;
  unit: string;
  qty: number;
  stock: number;
  /** False when its ingredient/product was deleted. */
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

export interface ManufacturingSummary {
  recipeCount: number;
  buildableNow: number;
  runsThisMonth: number;
  unitsThisMonth: number;
  lowIngredients: number;
}

/** A recipe line as the form sends it: an ingredient, or a kept legacy product line. */
export type ComponentDraft = { ingredientId: string; qty: number } | { productId: string; qty: number };

export interface RecipeFields {
  productId: string;
  outputQty: number;
  note: string;
  isActive: boolean;
  components: ComponentDraft[];
}

export type Result<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error?: string;
      errors?: Record<string, string>;
      shortage?: { name: string; needed: number; available: number; unit: string };
      /** NO_MATCH from the recipe assistant: the recipes the library does know. */
      code?: string;
      known?: string[];
    };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getManufacturingSummary(): Promise<Result<{ summary: ManufacturingSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listRecipes(): Promise<Result<{ recipes: Recipe[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/recipes`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listProductionRuns(): Promise<Result<{ runs: ProductionRunSummary[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/runs`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listIngredients(): Promise<Result<{ ingredients: Ingredient[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/ingredients`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Recipe assistant (recipe library + baker's-percentage scaling) ─────────────

/** One drafted line; `existingIngredientId` is set when it matched a stocked ingredient. */
export interface SuggestedIngredient {
  name: string;
  qty: number;
  unit: IngredientUnit;
  existingIngredientId: string | null;
  note: string | null;
}

/** How a library answer was computed (baker's percentages). */
export interface SuggestionBasis {
  matchedRecipe: string;
  matchScore: number;
  pieceWeightG: number;
  pieceLabel: string;
  doughGrams: number;
  flourGrams: number;
  doughPctTotal: number;
  formula: { name: string; pct: number; grams: number; inDough: boolean }[];
}

export interface RecipeSuggestion {
  /** Always the VENDOPOS recipe library (retrieval + scaling, no AI model). */
  source: "library";
  recipeName: string;
  piecesPerBatch: number;
  ingredients: SuggestedIngredient[];
  steps: string[];
  tips: string[];
  basis: SuggestionBasis;
  alternatives: string[];
}

/** The assistant is always on; returns the recipe names in the library. */
export async function getAssistantStatus(): Promise<
  Result<{ enabled: boolean; libraryRecipes: string[] }>
> {
  try {
    return await readJson(await fetch(`${BASE}/assistant`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Draft one batch's ingredients for a product. Nothing is saved. */
export function suggestRecipe(input: {
  product: string;
  piecesPerBatch: number;
  notes: string;
}): Promise<Result<{ suggestion: RecipeSuggestion }>> {
  return sendJson(`${BASE}/assistant/suggest`, "POST", input);
}

// ── Ingredient writes ─────────────────────────────────────────────────────────

async function sendJson<T>(url: string, method: string, body: unknown): Promise<Result<T>> {
  try {
    return await readJson(
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export function createIngredient(fields: IngredientFields): Promise<Result<{ ingredient: Ingredient }>> {
  return sendJson(`${BASE}/ingredients`, "POST", fields);
}

export function updateIngredient(
  id: string,
  fields: Partial<IngredientFields>,
): Promise<Result<{ ingredient: Ingredient }>> {
  return sendJson(`${BASE}/ingredients/${id}`, "PATCH", fields);
}

/** ADD `qty` to what's on hand (a delivery / market run). */
export function restockIngredient(id: string, qty: string): Promise<Result<{ ingredient: Ingredient }>> {
  return sendJson(`${BASE}/ingredients/${id}/restock`, "POST", { qty });
}

export async function deleteIngredient(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(await fetch(`${BASE}/ingredients/${id}`, { method: "DELETE", credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Recipe writes ─────────────────────────────────────────────────────────────

export async function createRecipe(fields: RecipeFields): Promise<Result<{ recipe: Recipe }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateRecipe(
  id: string,
  fields: Partial<RecipeFields>,
): Promise<Result<{ recipe: Recipe }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteRecipe(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(await fetch(`${BASE}/recipes/${id}`, { method: "DELETE", credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function produce(
  id: string,
  batches: number,
  note = "",
): Promise<Result<{ run: ProductionRunDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/recipes/${id}/produce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batches, note }),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
