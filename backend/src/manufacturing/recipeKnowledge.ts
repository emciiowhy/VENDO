import type { Ingredient, IngredientUnit } from "./manufacturing.schema.js";

/**
 * VENDOPOS recipe library — the knowledge base behind "Suggest ingredients".
 *
 * A retrieval-based recommender, not a generative model: the owner's product
 * name is matched against this curated library (text similarity), and the best
 * formula is SCALED to the requested batch size with baker's percentages. No
 * external service, no per-request cost, and every number can be traced back
 * to a formula + an arithmetic step.
 *
 * Baker's percentage: each ingredient's weight is expressed as a percent of the
 * flour weight (flour = 100%). For N pieces of W grams of dough each:
 *
 *   total dough  D = N × W
 *   flour        F = D ÷ (Σ dough percentages ÷ 100)
 *   ingredient   I = F × (its percentage ÷ 100)
 *
 * Fillings/toppings (`inDough: false`) are scaled from F the same way but don't
 * count toward the dough weight. Liquids are written in mL (≈ 1 g/mL) and eggs
 * in pieces (≈ 50 g each, shelled).
 *
 * The formulas are typical Philippine bakery formulas compiled for this system;
 * they are a starting point the owner adjusts, and should be checked against a
 * baking reference before being cited.
 */

type Measure = "weight" | "volume" | "egg";

interface FormulaLine {
  name: string;
  /** Baker's percentage (flour = 100). */
  pct: number;
  measure?: Measure;
  /** False for fillings and toppings — scaled from flour, excluded from dough weight. */
  inDough?: boolean;
  note?: string;
}

export interface LibraryRecipe {
  id: string;
  name: string;
  aliases: string[];
  /** Dough (or batter) weight of one finished piece before baking, in grams. */
  pieceWeightG: number;
  /** What one "piece" is, for display: "piece", "loaf", "roll"… */
  pieceLabel: string;
  formula: FormulaLine[];
  steps: string[];
  tips: string[];
}

const EGG_GRAMS = 50;

export const RECIPE_LIBRARY: LibraryRecipe[] = [
  {
    id: "pandesal",
    name: "Pandesal",
    aliases: ["pan de sal", "pandesal classic", "salt bread"],
    pieceWeightG: 48,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 12 },
      { name: "Instant dry yeast", pct: 1.4 },
      { name: "Salt", pct: 1.6 },
      { name: "Powdered milk", pct: 5 },
      { name: "Butter or margarine", pct: 8 },
      { name: "Eggs", pct: 10, measure: "egg" },
      { name: "Water", pct: 54, measure: "volume", note: "lukewarm" },
      { name: "Fine bread crumbs", pct: 6, inDough: false, note: "for coating" },
    ],
    steps: [
      "Mix flour, sugar, yeast, salt and powdered milk.",
      "Add eggs and lukewarm water; knead until smooth, then knead in the butter.",
      "Rest 45–60 minutes until doubled.",
      "Roll into logs, cut into pieces and coat in bread crumbs.",
      "Proof 30–45 minutes, then bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Weigh each piece for even size and baking.", "Bread flour gives a softer, taller pandesal than all-purpose."],
  },
  {
    id: "ube-pandesal",
    name: "Ube Pandesal",
    aliases: ["ube cheese pandesal", "ube pan de sal", "purple pandesal"],
    pieceWeightG: 50,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 14 },
      { name: "Instant dry yeast", pct: 1.4 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 5 },
      { name: "Butter or margarine", pct: 10 },
      { name: "Eggs", pct: 10, measure: "egg" },
      { name: "Ube halaya", pct: 20 },
      { name: "Water", pct: 42, measure: "volume" },
      { name: "Ube halaya (filling)", pct: 20, inDough: false, note: "filling" },
      { name: "Cheese", pct: 15, inDough: false, note: "filling" },
      { name: "Fine bread crumbs", pct: 6, inDough: false, note: "for coating" },
    ],
    steps: [
      "Mix the dry ingredients, then add eggs, ube halaya and water; knead until smooth.",
      "Knead in the butter and rest until doubled.",
      "Divide, flatten, fill with ube halaya and a cube of cheese, then seal.",
      "Coat in bread crumbs, proof 30–45 minutes and bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Reduce the water if your ube halaya is very soft."],
  },
  {
    id: "spanish-bread",
    name: "Spanish Bread",
    aliases: ["spanish", "pan de spanish"],
    pieceWeightG: 50,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 18 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 5 },
      { name: "Butter or margarine", pct: 12 },
      { name: "Eggs", pct: 15, measure: "egg" },
      { name: "Water", pct: 48, measure: "volume" },
      { name: "Butter (filling)", pct: 15, inDough: false, note: "filling" },
      { name: "Brown sugar", pct: 20, inDough: false, note: "filling" },
      { name: "Fine bread crumbs", pct: 18, inDough: false, note: "filling and coating" },
    ],
    steps: [
      "Make the dough, knead in the butter and rest until doubled.",
      "Mix the filling: softened butter, brown sugar and bread crumbs.",
      "Flatten each piece, spread the filling and roll up from the wide end.",
      "Roll in bread crumbs, proof 30–40 minutes and bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Keep some filling aside to brush on top before baking."],
  },
  {
    id: "ensaymada",
    name: "Ensaymada",
    aliases: ["ensaimada", "ensaymada cheese"],
    pieceWeightG: 60,
    pieceLabel: "piece",
    formula: [
      { name: "All-purpose flour", pct: 100 },
      { name: "White sugar", pct: 25 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1 },
      { name: "Eggs", pct: 30, measure: "egg", note: "or 2 yolks per egg for a richer dough" },
      { name: "Butter", pct: 25 },
      { name: "Evaporated milk", pct: 35, measure: "volume" },
      { name: "Butter (topping)", pct: 10, inDough: false, note: "topping" },
      { name: "White sugar (topping)", pct: 8, inDough: false, note: "topping" },
      { name: "Grated cheese", pct: 10, inDough: false, note: "topping" },
    ],
    steps: [
      "Mix flour, sugar, yeast and salt; add eggs and milk and knead until smooth.",
      "Knead in the butter gradually; the dough will be soft. Rest until doubled.",
      "Roll each piece into a rope, brush with butter and coil into a spiral.",
      "Proof 45–60 minutes, bake at 175°C for 12–15 minutes.",
      "Top with butter, sugar and grated cheese while warm.",
    ],
    tips: ["Chill the dough briefly if it is too sticky to roll."],
  },
  {
    id: "monay",
    name: "Monay",
    aliases: ["pan de monay", "putok monay"],
    pieceWeightG: 60,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 15 },
      { name: "Instant dry yeast", pct: 1.2 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 4 },
      { name: "Shortening", pct: 10 },
      { name: "Eggs", pct: 10, measure: "egg" },
      { name: "Water", pct: 52, measure: "volume" },
    ],
    steps: [
      "Mix and knead into a firm, smooth dough; rest until doubled.",
      "Shape into balls and press a dowel across the middle to form the split.",
      "Proof 40 minutes, bake at 180°C for 18–20 minutes.",
    ],
    tips: ["Monay is a denser bread — a firmer dough than pandesal is normal."],
  },
  {
    id: "pan-de-coco",
    name: "Pan de Coco",
    aliases: ["pandecoco", "coconut bread"],
    pieceWeightG: 55,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 15 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 4 },
      { name: "Butter or margarine", pct: 10 },
      { name: "Eggs", pct: 10, measure: "egg" },
      { name: "Water", pct: 50, measure: "volume" },
      { name: "Grated coconut", pct: 40, inDough: false, note: "filling" },
      { name: "Brown sugar", pct: 25, inDough: false, note: "filling, cooked with the coconut" },
    ],
    steps: [
      "Cook grated coconut and brown sugar until sticky; cool.",
      "Make the dough and rest until doubled.",
      "Flatten each piece, fill with the coconut mixture and seal.",
      "Proof 30–40 minutes, bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Cool the filling fully so it doesn't melt the dough."],
  },
  {
    id: "pan-de-regla",
    name: "Pan de Regla",
    aliases: ["pan de pula", "kalihim", "red bread"],
    pieceWeightG: 55,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 15 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 4 },
      { name: "Butter or margarine", pct: 10 },
      { name: "Eggs", pct: 10, measure: "egg" },
      { name: "Water", pct: 50, measure: "volume" },
      { name: "Fine bread crumbs", pct: 20, inDough: false, note: "filling" },
      { name: "White sugar (filling)", pct: 15, inDough: false, note: "filling" },
      { name: "Evaporated milk (filling)", pct: 15, measure: "volume", inDough: false, note: "filling" },
    ],
    steps: [
      "Make the dough and rest until doubled.",
      "Mix bread crumbs, sugar, milk and red food color into a paste.",
      "Fill and fold each piece, proof 30–40 minutes, bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Use day-old bread crumbs from unsold bread to cut waste."],
  },
  {
    id: "cheese-bread",
    name: "Cheese Bread",
    aliases: ["cheesy bread", "cheese roll", "pan de queso"],
    pieceWeightG: 45,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 18 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 6 },
      { name: "Butter", pct: 12 },
      { name: "Eggs", pct: 15, measure: "egg" },
      { name: "Evaporated milk", pct: 45, measure: "volume" },
      { name: "Cheese", pct: 15, inDough: false, note: "filling" },
      { name: "White sugar (coating)", pct: 6, inDough: false, note: "coating" },
    ],
    steps: [
      "Make a soft enriched dough and rest until doubled.",
      "Wrap each piece around a cube of cheese.",
      "Dip in milk then sugar, proof 30–40 minutes, bake at 175°C for 12–15 minutes.",
    ],
    tips: ["A quick milk-and-sugar coat gives the classic crust."],
  },
  {
    id: "star-bread",
    name: "Star Bread",
    aliases: ["putok", "pan de putok", "star"],
    pieceWeightG: 50,
    pieceLabel: "piece",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 15 },
      { name: "Instant dry yeast", pct: 1.2 },
      { name: "Salt", pct: 1.5 },
      { name: "Powdered milk", pct: 4 },
      { name: "Butter or margarine", pct: 10 },
      { name: "Eggs", pct: 8, measure: "egg" },
      { name: "Water", pct: 52, measure: "volume" },
      { name: "White sugar (topping)", pct: 8, inDough: false, note: "topping" },
    ],
    steps: [
      "Make a firm dough and rest until doubled.",
      "Shape into balls, brush with water and dip in sugar.",
      "Score a cross on top, proof 30 minutes, bake at 180°C for 15–18 minutes.",
    ],
    tips: ["Score deeply so the top opens into a star."],
  },
  {
    id: "cinnamon-roll",
    name: "Cinnamon Roll",
    aliases: ["cinnamon rolls", "cinnamon bun", "cinnaroll"],
    pieceWeightG: 70,
    pieceLabel: "roll",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 15 },
      { name: "Instant dry yeast", pct: 1.5 },
      { name: "Salt", pct: 1.5 },
      { name: "Eggs", pct: 15, measure: "egg" },
      { name: "Butter", pct: 15 },
      { name: "Fresh milk", pct: 50, measure: "volume" },
      { name: "Brown sugar", pct: 25, inDough: false, note: "filling" },
      { name: "Butter (filling)", pct: 12, inDough: false, note: "filling" },
      { name: "Ground cinnamon", pct: 2, inDough: false, note: "filling" },
    ],
    steps: [
      "Make the dough and rest until doubled.",
      "Roll into a rectangle, spread butter, sprinkle brown sugar and cinnamon.",
      "Roll up, cut into rolls, proof 40 minutes, bake at 175°C for 20–25 minutes.",
    ],
    tips: ["Cut with thread or floss for clean spirals."],
  },
  {
    id: "loaf-bread",
    name: "Loaf Bread",
    aliases: ["tasty bread", "white bread", "sandwich bread", "tinapay loaf"],
    pieceWeightG: 450,
    pieceLabel: "loaf",
    formula: [
      { name: "Bread flour", pct: 100 },
      { name: "White sugar", pct: 8 },
      { name: "Instant dry yeast", pct: 1.2 },
      { name: "Salt", pct: 1.8 },
      { name: "Powdered milk", pct: 4 },
      { name: "Shortening", pct: 5 },
      { name: "Water", pct: 62, measure: "volume" },
    ],
    steps: [
      "Knead into a smooth, elastic dough; rest until doubled.",
      "Shape into a log and place in a greased loaf pan.",
      "Proof until 1 cm above the pan, bake at 190°C for 25–30 minutes.",
    ],
    tips: ["Cool completely before slicing."],
  },
  {
    id: "kababayan",
    name: "Kababayan",
    aliases: ["kababayan muffin", "gong bread", "filipino muffin"],
    pieceWeightG: 45,
    pieceLabel: "piece",
    formula: [
      { name: "All-purpose flour", pct: 100 },
      { name: "White sugar", pct: 70 },
      { name: "Eggs", pct: 60, measure: "egg" },
      { name: "Butter or margarine", pct: 50, note: "melted" },
      { name: "Evaporated milk", pct: 50, measure: "volume" },
      { name: "Baking powder", pct: 4 },
      { name: "Salt", pct: 0.8 },
    ],
    steps: [
      "Whisk eggs and sugar, then add melted butter and milk.",
      "Fold in flour, baking powder and salt until just combined.",
      "Fill greased molds two-thirds full, bake at 175°C for 15–18 minutes.",
    ],
    tips: ["Don't overmix — it makes the muffins tough."],
  },
  {
    id: "puto",
    name: "Puto",
    aliases: ["puto cheese", "steamed cake", "puto mamon"],
    pieceWeightG: 30,
    pieceLabel: "piece",
    formula: [
      { name: "All-purpose flour", pct: 100 },
      { name: "White sugar", pct: 50 },
      { name: "Baking powder", pct: 6 },
      { name: "Evaporated milk", pct: 60, measure: "volume" },
      { name: "Water", pct: 40, measure: "volume" },
      { name: "Eggs", pct: 25, measure: "egg" },
      { name: "Butter or margarine", pct: 10, note: "melted" },
      { name: "Cheese", pct: 10, inDough: false, note: "topping" },
    ],
    steps: [
      "Sift flour, sugar and baking powder.",
      "Add milk, water, eggs and melted butter; whisk until smooth.",
      "Pour into molds, top with cheese, steam 12–15 minutes.",
    ],
    tips: ["Wrap the steamer lid in a cloth so water doesn't drip on the puto."],
  },
  {
    id: "banana-bread",
    name: "Banana Bread",
    aliases: ["banana loaf", "banana cake", "saging bread"],
    pieceWeightG: 600,
    pieceLabel: "loaf",
    formula: [
      { name: "All-purpose flour", pct: 100 },
      { name: "White sugar", pct: 60 },
      { name: "Eggs", pct: 50, measure: "egg" },
      { name: "Butter or margarine", pct: 50, note: "melted" },
      { name: "Ripe bananas", pct: 120, note: "mashed" },
      { name: "Baking soda", pct: 2 },
      { name: "Salt", pct: 1 },
    ],
    steps: [
      "Mash the bananas; whisk in sugar, eggs and melted butter.",
      "Fold in flour, baking soda and salt.",
      "Pour into a lined loaf pan, bake at 175°C for 50–60 minutes.",
    ],
    tips: ["Very ripe, spotty bananas give the best flavor."],
  },
];

// ── Retrieval: text similarity ───────────────────────────────────────────────

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const t = `  ${s.replace(/ /g, "")} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

/**
 * Similarity in [0, 1]: Dice coefficient over character trigrams (tolerates
 * typos and spacing — "pan de sal" ≈ "pandesal"), lifted to 1 for an exact
 * match and boosted when one name fully contains the other ("ube cheese
 * pandesal" contains "pandesal").
 */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x.replace(/ /g, "") === y.replace(/ /g, "")) return 1;
  const ta = trigrams(x);
  const tb = trigrams(y);
  let common = 0;
  for (const g of ta) if (tb.has(g)) common++;
  const dice = (2 * common) / (ta.size + tb.size);
  const contains = x.includes(y) || y.includes(x) ? 0.15 : 0;
  return Math.min(1, dice + contains);
}

export interface RecipeMatch {
  recipe: LibraryRecipe;
  score: number;
}

/** Minimum similarity to count as a match (below this the library has no answer). */
export const MATCH_THRESHOLD = 0.45;

/** Rank library recipes by how well their name/aliases match the query. */
export function findRecipes(query: string): RecipeMatch[] {
  return RECIPE_LIBRARY.map((recipe) => ({
    recipe,
    score: Math.max(...[recipe.name, ...recipe.aliases].map((n) => similarity(query, n))),
  }))
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

// ── Scaling: baker's percentages ─────────────────────────────────────────────

export interface ScaledLine {
  name: string;
  pct: number;
  inDough: boolean;
  /** Computed weight in grams (before unit conversion). */
  grams: number;
  qty: number;
  unit: IngredientUnit;
  note: string | null;
}

export interface ScaledRecipe {
  pieces: number;
  pieceWeightG: number;
  doughGrams: number;
  flourGrams: number;
  doughPctTotal: number;
  lines: ScaledLine[];
}

/** Round to a sensible kitchen precision for the unit. */
function roundFor(value: number, unit: IngredientUnit): number {
  if (unit === "kg" || unit === "L") return Math.round(value * 100) / 100; // 10 g / 10 mL
  if (value < 20) return Math.round(value * 10) / 10; // small amounts: 0.1 g
  return Math.round(value);
}

/** Express a gram/mL amount in the friendliest unit: g→kg and mL→L at 1000. */
function toDisplay(grams: number, measure: Measure): { qty: number; unit: IngredientUnit } {
  if (measure === "egg") return { qty: Math.max(1, Math.round(grams / EGG_GRAMS)), unit: "pcs" };
  const big = grams >= 1000;
  const unit: IngredientUnit = measure === "volume" ? (big ? "L" : "mL") : big ? "kg" : "g";
  const value = big ? grams / 1000 : grams;
  return { qty: roundFor(value, unit), unit };
}

/** Scale a library formula to `pieces` pieces. */
export function scaleRecipe(recipe: LibraryRecipe, pieces: number): ScaledRecipe {
  const doughGrams = pieces * recipe.pieceWeightG;
  const doughPctTotal = recipe.formula.filter((l) => l.inDough !== false).reduce((s, l) => s + l.pct, 0);
  const flourGrams = doughGrams / (doughPctTotal / 100);
  const lines = recipe.formula.map((l) => {
    const grams = (flourGrams * l.pct) / 100;
    const { qty, unit } = toDisplay(grams, l.measure ?? "weight");
    return {
      name: l.name,
      pct: l.pct,
      inDough: l.inDough !== false,
      grams: Math.round(grams * 10) / 10,
      qty,
      unit,
      note: l.note ?? null,
    };
  });
  return {
    pieces,
    pieceWeightG: recipe.pieceWeightG,
    doughGrams,
    flourGrams: Math.round(flourGrams * 10) / 10,
    doughPctTotal: Math.round(doughPctTotal * 10) / 10,
    lines,
  };
}

// ── Matching to the store's own ingredients ──────────────────────────────────

const BASE: Record<IngredientUnit, { dim: string; factor: number }> = {
  g: { dim: "mass", factor: 1 },
  kg: { dim: "mass", factor: 1000 },
  mL: { dim: "volume", factor: 1 },
  L: { dim: "volume", factor: 1000 },
  pcs: { dim: "count", factor: 1 },
};

/** Convert between units of the same dimension (g↔kg, mL↔L); null otherwise. */
export function convertUnit(qty: number, from: IngredientUnit, to: IngredientUnit): number | null {
  const a = BASE[from];
  const b = BASE[to];
  if (!a || !b || a.dim !== b.dim) return null;
  return (qty * a.factor) / b.factor;
}

/** A stocked ingredient counts as "the same" at this similarity or above. */
export const STORE_MATCH_THRESHOLD = 0.6;

/** The store ingredient that best matches a formula line (name + compatible unit), if any. */
export function matchStoreIngredient(
  name: string,
  unit: IngredientUnit,
  store: Ingredient[],
  taken: Set<string>,
): Ingredient | null {
  // "White sugar (topping)" should still match the store's "White sugar".
  const base = name.replace(/\s*\(.*\)\s*$/, "");
  let best: { ing: Ingredient; score: number } | null = null;
  for (const ing of store) {
    if (taken.has(ing.id)) continue;
    if (convertUnit(1, unit, ing.unit as IngredientUnit) === null) continue;
    const score = Math.max(similarity(base, ing.name), ...base.split(/ or /).map((alt) => similarity(alt, ing.name)));
    if (score >= STORE_MATCH_THRESHOLD && (!best || score > best.score)) best = { ing, score };
  }
  return best?.ing ?? null;
}
