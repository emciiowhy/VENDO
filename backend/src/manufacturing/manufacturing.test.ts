import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  ingredientCreateSchema,
  ingredientRestockSchema,
  produceSchema,
  recipeCreateSchema,
} from "./manufacturing.schema.js";

const app = createApp();
const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("Manufacturing routes require store-management auth", () => {
  it("blocks the summary for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/manufacturing/summary");
    expect(res.status).toBe(401);
  });

  it("blocks listing recipes for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/manufacturing/recipes");
    expect(res.status).toBe(401);
  });

  it("blocks production history for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/manufacturing/runs");
    expect(res.status).toBe(401);
  });

  it("blocks producing for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post(`/api/v1/manufacturing/recipes/${UUID_A}/produce`)
      .send({ batches: 2 });
    expect(res.status).toBe(401);
  });

  it("blocks listing and adding ingredients for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/manufacturing/ingredients")).status).toBe(401);
    const res = await request(app)
      .post("/api/v1/manufacturing/ingredients")
      .send({ name: "Flour", unit: "g", stock: 1000 });
    expect(res.status).toBe(401);
  });

  it("blocks restocking an ingredient for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post(`/api/v1/manufacturing/ingredients/${UUID_A}/restock`)
      .send({ qty: 500 });
    expect(res.status).toBe(401);
  });
});

describe("ingredientCreateSchema", () => {
  it("accepts a decimal stock in a measuring unit", () => {
    const i = ingredientCreateSchema.parse({ name: " All-purpose flour ", unit: "kg", stock: "12.5" });
    expect(i.name).toBe("All-purpose flour");
    expect(i.stock).toBe(12.5);
    expect(i.lowStockThreshold).toBe(0);
  });

  it("rejects an unknown unit", () => {
    expect(ingredientCreateSchema.safeParse({ name: "Flour", unit: "cups" }).success).toBe(false);
  });

  it("rejects negative stock", () => {
    expect(ingredientCreateSchema.safeParse({ name: "Flour", unit: "g", stock: -1 }).success).toBe(false);
  });
});

describe("ingredientRestockSchema", () => {
  it("requires a positive amount", () => {
    expect(ingredientRestockSchema.safeParse({ qty: 0 }).success).toBe(false);
    expect(ingredientRestockSchema.parse({ qty: "1,000" }).qty).toBe(1000);
  });
});

describe("recipeCreateSchema", () => {
  it("accepts an ingredient recipe and defaults output qty to 1", () => {
    const r = recipeCreateSchema.parse({
      productId: UUID_A,
      components: [{ ingredientId: UUID_B, qty: 500 }],
    });
    expect(r.outputQty).toBe(1);
    expect(r.components[0].qty).toBe(500);
  });

  it("allows decimal ingredient amounts", () => {
    const r = recipeCreateSchema.parse({
      productId: UUID_A,
      components: [{ ingredientId: UUID_B, qty: "7.5" }],
    });
    expect(r.components[0].qty).toBe(7.5);
  });

  it("still accepts a legacy catalogue-product line", () => {
    const r = recipeCreateSchema.safeParse({
      productId: UUID_A,
      components: [{ productId: UUID_B, qty: 3 }],
    });
    expect(r.success).toBe(true);
  });

  it("requires exactly one of ingredient or product per line", () => {
    const base = { productId: UUID_A };
    expect(recipeCreateSchema.safeParse({ ...base, components: [{ qty: 1 }] }).success).toBe(false);
    expect(
      recipeCreateSchema.safeParse({
        ...base,
        components: [{ ingredientId: UUID_B, productId: UUID_B, qty: 1 }],
      }).success,
    ).toBe(false);
  });

  it("requires at least one component", () => {
    const r = recipeCreateSchema.safeParse({ productId: UUID_A, components: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid finished product", () => {
    const r = recipeCreateSchema.safeParse({
      productId: "not-a-uuid",
      components: [{ ingredientId: UUID_B, qty: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a zero/negative component quantity", () => {
    const r = recipeCreateSchema.safeParse({
      productId: UUID_A,
      components: [{ ingredientId: UUID_B, qty: 0 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("produceSchema", () => {
  it("defaults batches to 1", () => {
    expect(produceSchema.parse({}).batches).toBe(1);
  });

  it("rejects fractional batches", () => {
    expect(produceSchema.safeParse({ batches: 1.5 }).success).toBe(false);
  });
});
