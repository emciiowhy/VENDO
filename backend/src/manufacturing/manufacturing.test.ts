import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { produceSchema, recipeCreateSchema } from "./manufacturing.schema.js";

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
});

describe("recipeCreateSchema", () => {
  it("accepts a recipe and defaults output qty to 1", () => {
    const r = recipeCreateSchema.parse({
      productId: UUID_A,
      components: [{ productId: UUID_B, qty: 3 }],
    });
    expect(r.outputQty).toBe(1);
    expect(r.components[0].qty).toBe(3);
  });

  it("requires at least one component", () => {
    const r = recipeCreateSchema.safeParse({ productId: UUID_A, components: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid finished product", () => {
    const r = recipeCreateSchema.safeParse({
      productId: "not-a-uuid",
      components: [{ productId: UUID_B, qty: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a zero/negative component quantity", () => {
    const r = recipeCreateSchema.safeParse({
      productId: UUID_A,
      components: [{ productId: UUID_B, qty: 0 }],
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
