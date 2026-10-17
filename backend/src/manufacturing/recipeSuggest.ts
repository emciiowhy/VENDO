import type { Ingredient, IngredientUnit } from "./manufacturing.schema.js";
import {
  RECIPE_LIBRARY,
  convertUnit,
  findRecipes,
  matchStoreIngredient,
  normalizeText,
  scaleRecipe,
  type LibraryRecipe,
} from "./recipeKnowledge.js";

export interface SuggestInput {
  product: string;
  piecesPerBatch: number;
  notes?: string;
}

/**
 * The recipe assistant behind "Suggest ingredients" in the recipe form.
 *
 *   1. RETRIEVE — find the closest recipe in the VENDOPOS recipe library by
 *      text similarity to what the owner typed ("pan de sal" → Pandesal).
 *   2. SCALE    — compute every ingredient for the requested batch size with
 *      baker's percentages (recipeKnowledge.scaleRecipe).
 *   3. MATCH    — map each ingredient to one the store already stocks (by name,
 *      in a compatible unit), merging duplicates such as dough + topping sugar.
 *
 * Free and deterministic: no external service and no AI model — the same input
 * always gives the same output, and the response says exactly how each number
 * was computed. A product outside the library returns NO_MATCH (with the list of
 * known recipes) and the owner enters that recipe by hand.
 */

export interface SuggestedLine {
  name: string;
  qty: number;
  unit: IngredientUnit;
  existingIngredientId: string | null;
  note: string | null;
}

/** How a library answer was computed — shown to the owner under "How we got these amounts". */
export interface SuggestionBasis {
  matchedRecipe: string;
  /** Text-similarity score of the match, 0–1. */
  matchScore: number;
  pieceWeightG: number;
  pieceLabel: string;
  doughGrams: number;
  flourGrams: number;
  doughPctTotal: number;
  formula: { name: string; pct: number; grams: number; inDough: boolean }[];
}

export interface Suggestion {
  source: "library";
  recipeName: string;
  piecesPerBatch: number;
  ingredients: SuggestedLine[];
  steps: string[];
  tips: string[];
  basis: SuggestionBasis;
  /** Other library recipes that also matched the query. */
  alternatives: string[];
}

export type SuggestOutcome =
  | { ok: true; suggestion: Suggestion }
  | { ok: false; code: "NO_MATCH"; known: string[] };

/** The assistant is always available — it needs nothing but the built-in library. */
export function assistantStatus(): { enabled: true; libraryRecipes: string[] } {
  return { enabled: true, libraryRecipes: RECIPE_LIBRARY.map((r) => r.name) };
}

const round = (n: number, unit: IngredientUnit) =>
  unit === "kg" || unit === "L" ? Math.round(n * 100) / 100 : n < 20 ? Math.round(n * 10) / 10 : Math.round(n);

/** Drop a trailing "(filling)" / "(topping)" qualifier: the stock item is the same. */
function baseName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

/**
 * Turn a scaled library recipe into suggestion lines: match each line to a
 * stocked ingredient, and merge lines that are the same stock item (the recipe
 * form allows each ingredient once).
 */
export function buildLibrarySuggestion(
  recipe: LibraryRecipe,
  score: number,
  pieces: number,
  store: Ingredient[],
  alternatives: string[],
): Suggestion {
  const scaled = scaleRecipe(recipe, pieces);

  interface Group {
    name: string;
    unit: IngredientUnit; // the unit we'll present in
    qty: number; // accumulated, in `unit`
    store: Ingredient | null;
    notes: string[];
  }
  const groups = new Map<string, Group>();

  for (const line of scaled.lines) {
    const match = matchStoreIngredient(line.name, line.unit, store, new Set());
    const key = match ? `id:${match.id}` : `name:${normalizeText(baseName(line.name))}:${line.unit === "pcs" ? "n" : "m"}`;
    const targetUnit = match ? (match.unit as IngredientUnit) : line.unit;
    const qty = convertUnit(line.qty, line.unit, targetUnit) ?? line.qty;
    const existing = groups.get(key);
    if (existing) {
      existing.qty += convertUnit(qty, targetUnit, existing.unit) ?? qty;
      if (line.note) existing.notes.push(line.note);
    } else {
      groups.set(key, {
        name: match?.name ?? baseName(line.name),
        unit: targetUnit,
        qty,
        store: match,
        notes: line.note ? [line.note] : [],
      });
    }
  }

  const ingredients: SuggestedLine[] = [...groups.values()].map((g) => {
    // Re-express merged gram/mL totals in kg/L once they pass 1000.
    let { qty, unit } = g;
    if (!g.store && unit === "g" && qty >= 1000) [qty, unit] = [qty / 1000, "kg"];
    if (!g.store && unit === "mL" && qty >= 1000) [qty, unit] = [qty / 1000, "L"];
    return {
      name: g.name,
      qty: unit === "pcs" ? Math.max(1, Math.round(qty)) : round(qty, unit),
      unit,
      existingIngredientId: g.store?.id ?? null,
      note: g.notes.length ? [...new Set(g.notes)].join("; ") : null,
    };
  });

  return {
    source: "library",
    recipeName: recipe.name,
    piecesPerBatch: pieces,
    ingredients,
    steps: recipe.steps,
    tips: recipe.tips,
    basis: {
      matchedRecipe: recipe.name,
      matchScore: Math.round(score * 100) / 100,
      pieceWeightG: scaled.pieceWeightG,
      pieceLabel: recipe.pieceLabel,
      doughGrams: scaled.doughGrams,
      flourGrams: scaled.flourGrams,
      doughPctTotal: scaled.doughPctTotal,
      formula: scaled.lines.map((l) => ({ name: l.name, pct: l.pct, grams: l.grams, inDough: l.inDough })),
    },
    alternatives,
  };
}

export function suggestRecipe(input: SuggestInput, store: Ingredient[]): SuggestOutcome {
  const matches = findRecipes(input.product);
  if (matches.length > 0) {
    const [best, ...rest] = matches;
    return {
      ok: true,
      suggestion: buildLibrarySuggestion(
        best.recipe,
        best.score,
        input.piecesPerBatch,
        store,
        rest.slice(0, 3).map((m) => m.recipe.name),
      ),
    };
  }

  return { ok: false, code: "NO_MATCH", known: RECIPE_LIBRARY.map((r) => r.name) };
}
