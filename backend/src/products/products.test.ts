import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { productCreateSchema, categoryCreateSchema } from "./products.schema.js";

const app = createApp();

describe("Inventory routes are fenced to authenticated store staff", () => {
  it("rejects unauthenticated product reads with 401", async () => {
    const res = await request(app).get("/api/inventory/products");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("rejects unauthenticated category writes with 401", async () => {
    const res = await request(app).post("/api/inventory/categories").send({ name: "Beverages" });
    expect(res.status).toBe(401);
  });
});

describe("Product payload validation (multipart fields arrive as strings)", () => {
  it("requires a name", () => {
    const parsed = productCreateSchema.safeParse({ price: "100", stock: "1", lowStockThreshold: "0" });
    expect(parsed.success).toBe(false);
  });

  it("normalises a peso price string into integer centavos", () => {
    const parsed = productCreateSchema.safeParse({
      name: "Kapeng Barako 12oz",
      price: "154.50",
      stock: "40",
      lowStockThreshold: "10",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.price).toBe(15450);
      expect(parsed.data.stock).toBe(40);
      expect(parsed.data.lowStockThreshold).toBe(10);
    }
  });

  it("treats an empty categoryId as 'clear' (null), not an error", () => {
    const parsed = productCreateSchema.safeParse({
      name: "Spanish Latte",
      price: "165",
      stock: "0",
      lowStockThreshold: "0",
      categoryId: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.categoryId).toBeNull();
  });

  it("rejects a non-numeric stock value", () => {
    const parsed = productCreateSchema.safeParse({
      name: "Bad Stock",
      price: "100",
      stock: "lots",
      lowStockThreshold: "0",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("Category payload validation", () => {
  it("requires a name", () => {
    expect(categoryCreateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a name with an optional parent", () => {
    const parsed = categoryCreateSchema.safeParse({ name: "Espresso", parentId: "" });
    expect(parsed.success).toBe(true);
  });
});
