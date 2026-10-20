import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  RECIPE_LIBRARY,
  convertUnit,
  findRecipes,
  matchStoreIngredient,
  scaleRecipe,
  similarity,
} from "./recipeKnowledge.js";
import { buildLibrarySuggestion, suggestRecipe } from "./recipeSuggest.js";
import { recipeSuggestSchema, type Ingredient } from "./manufacturing.schema.js";

const pandesal = RECIPE_LIBRARY.find((r) => r.id === "pandesal")!;

function ingredient(id: string, name: string, unit: string): Ingredient {
  return {
    id,
    name,
    unit,
    stock: 0,
    lowStockThreshold: 0,
    lowStock: false,
    recipeCount: 0,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
  };
}

describe("retrieval (text similarity)", () => {
  it("finds a recipe despite spacing and typos", () => {
    expect(findRecipes("pan de sal")[0].recipe.id).toBe("pandesal");
    expect(findRecipes("PANDESAL")[0].recipe.id).toBe("pandesal");
    expect(findRecipes("pandsal")[0].recipe.id).toBe("pandesal");
    expect(findRecipes("ensaimada")[0].recipe.id).toBe("ensaymada");
  });

  it("prefers the more specific recipe when one name contains another", () => {
    expect(findRecipes("ube cheese pandesal")[0].recipe.id).toBe("ube-pandesal");
  });

  it("returns nothing for products outside the library", () => {
    expect(findRecipes("adobo")).toEqual([]);
    expect(findRecipes("iced coffee")).toEqual([]);
  });

  it("scores identical names 1 and unrelated names low", () => {
    expect(similarity("Monay", "monay")).toBe(1);
    expect(similarity("Monay", "Banana Bread")).toBeLessThan(0.3);
  });
});

describe("scaling (baker's percentages)", () => {
  it("scales pandesal for 20 pieces to the classic 500 g-flour batch", () => {
    const s = scaleRecipe(pandesal, 20);
    expect(s.doughGrams).toBe(960); // 20 × 48 g
    expect(s.doughPctTotal).toBe(192); // Σ dough percentages
    expect(s.flourGrams).toBe(500); // 960 ÷ 1.92
    const by = Object.fromEntries(s.lines.map((l) => [l.name, l]));
    expect(by["White sugar"]).toMatchObject({ qty: 60, unit: "g" });
    expect(by["Instant dry yeast"]).toMatchObject({ qty: 7, unit: "g" });
    expect(by["Salt"]).toMatchObject({ qty: 8, unit: "g" });
    expect(by["Powdered milk"]).toMatchObject({ qty: 25, unit: "g" });
    expect(by["Butter or margarine"]).toMatchObject({ qty: 40, unit: "g" });
    expect(by["Eggs"]).toMatchObject({ qty: 1, unit: "pcs" });
    expect(by["Water"]).toMatchObject({ qty: 270, unit: "mL" });
  });

  it("is linear: double the pieces, double every ingredient", () => {
    const a = scaleRecipe(pandesal, 20);
    const b = scaleRecipe(pandesal, 40);
    expect(b.flourGrams).toBeCloseTo(a.flourGrams * 2);
    expect(b.lines[0].grams).toBeCloseTo(a.lines[0].grams * 2);
  });

  it("switches to kg / L once an amount reaches 1000", () => {
    const s = scaleRecipe(pandesal, 100); // 4,800 g dough → 2.5 kg flour
    expect(s.lines[0]).toMatchObject({ name: "Bread flour", qty: 2.5, unit: "kg" });
    expect(s.lines.find((l) => l.name === "Water")).toMatchObject({ qty: 1.35, unit: "L" });
  });

  it("excludes fillings from the dough weight but still scales them", () => {
    const s = scaleRecipe(pandesal, 20);
    const crumbs = s.lines.find((l) => l.name === "Fine bread crumbs")!;
    expect(crumbs.inDough).toBe(false);
    expect(crumbs.qty).toBe(30); // 6% of 500 g
  });

  it("every library recipe has flour at 100% and positive percentages", () => {
    for (const r of RECIPE_LIBRARY) {
      expect(r.formula[0].pct, r.name).toBe(100);
      expect(r.formula.every((l) => l.pct > 0), r.name).toBe(true);
      expect(r.pieceWeightG, r.name).toBeGreaterThan(0);
    }
  });
});

describe("matching to the store's ingredients", () => {
  const store = [
    ingredient("a", "All-purpose flour", "kg"),
    ingredient("b", "Bread flour", "kg"),
    ingredient("c", "Sugar", "g"),
    ingredient("d", "Eggs", "pcs"),
    ingredient("e", "Butter", "g"),
  ];

  it("converts g↔kg and mL↔L but not across dimensions", () => {
    expect(convertUnit(500, "g", "kg")).toBe(0.5);
    expect(convertUnit(1.5, "L", "mL")).toBe(1500);
    expect(convertUnit(1, "pcs", "g")).toBeNull();
  });

  it("matches by name in a compatible unit", () => {
    expect(matchStoreIngredient("Bread flour", "g", store, new Set())?.id).toBe("b");
    expect(matchStoreIngredient("Eggs", "pcs", store, new Set())?.id).toBe("d");
    expect(matchStoreIngredient("Butter or margarine", "g", store, new Set())?.id).toBe("e");
    expect(matchStoreIngredient("Instant dry yeast", "g", store, new Set())).toBeNull();
  });

  it("builds a suggestion in the store's units and merges duplicate stock items", () => {
    const sugg = buildLibrarySuggestion(pandesal, 1, 20, store, []);
    const flour = sugg.ingredients.find((i) => i.existingIngredientId === "b")!;
    expect(flour).toMatchObject({ name: "Bread flour", qty: 0.5, unit: "kg" });
    const yeast = sugg.ingredients.find((i) => i.name === "Instant dry yeast")!;
    expect(yeast).toMatchObject({ existingIngredientId: null, qty: 7, unit: "g" });
    // each stock item appears once
    const ids = sugg.ingredients.map((i) => i.existingIngredientId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sugg.basis).toMatchObject({ matchedRecipe: "Pandesal", flourGrams: 500, doughGrams: 960 });
  });

  it("merges a dough and topping line of the same ingredient into one", () => {
    const starBread = RECIPE_LIBRARY.find((r) => r.id === "star-bread")!;
    const sugg = buildLibrarySuggestion(starBread, 1, 20, [], []);
    const sugar = sugg.ingredients.filter((i) => i.name === "White sugar");
    expect(sugar).toHaveLength(1);
    // dough 15% + topping 8% of the same flour weight
    const scaled = scaleRecipe(starBread, 20);
    expect(sugar[0].qty).toBeCloseTo(Math.round(scaled.flourGrams * 0.23), 0);
  });
});

describe("suggestRecipe (library only)", () => {
  it("answers from the library for a known product at no cost", () => {
    const out = suggestRecipe({ product: "Pandesal", piecesPerBatch: 20 }, []);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.suggestion.source).toBe("library");
  });

  it("reports NO_MATCH with the known recipes for an unknown product", () => {
    const out = suggestRecipe({ product: "Chicken adobo", piecesPerBatch: 10 }, []);
    expect(out).toMatchObject({ ok: false, code: "NO_MATCH" });
    if (!out.ok && out.code === "NO_MATCH") expect(out.known).toContain("Pandesal");
  });
});

describe("recipeSuggestSchema", () => {
  it("accepts a product and batch size", () => {
    const r = recipeSuggestSchema.parse({ product: " Pandesal ", piecesPerBatch: "20", notes: "" });
    expect(r).toEqual({ product: "Pandesal", piecesPerBatch: 20, notes: undefined });
  });

  it("rejects an empty product or a zero batch", () => {
    expect(recipeSuggestSchema.safeParse({ product: "", piecesPerBatch: 20 }).success).toBe(false);
    expect(recipeSuggestSchema.safeParse({ product: "Pandesal", piecesPerBatch: 0 }).success).toBe(false);
  });
});

describe("Recipe assistant is switched off with Manufacturing", () => {
  const app = createApp();

  it("404s the status check and suggestions", async () => {
    expect((await request(app).get("/api/v1/manufacturing/assistant")).status).toBe(404);
    const res = await request(app).post("/api/v1/manufacturing/assistant/suggest").send({ product: "Pandesal" });
    expect(res.status).toBe(404);
  });
});
