import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { poCreateSchema, supplierCreateSchema } from "./procurement.schema.js";

const app = createApp();

// Procurement was retired from VendoPOS (capstone scope): the router is no
// longer mounted, so every endpoint is gone. Suppliers / POs stay in the DB
// (Finance still reads past POs); restocking is a Product Management edit.
describe("Procurement is switched off", () => {
  it.each([
    ["get", "/api/v1/procurement/summary"],
    ["get", "/api/v1/procurement/suppliers"],
    ["get", "/api/v1/procurement/purchase-orders"],
    ["post", "/api/v1/procurement/purchase-orders/00000000-0000-0000-0000-000000000000/receive"],
  ] as const)("%s %s → 404", async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(404);
  });
});

describe("supplierCreateSchema", () => {
  it("accepts a minimal supplier (name only)", () => {
    const s = supplierCreateSchema.parse({ name: "Nestlé Philippines" });
    expect(s.name).toBe("Nestlé Philippines");
  });

  it("collapses blank optional fields to undefined", () => {
    const s = supplierCreateSchema.parse({ name: "ACME", contactName: "", phone: "" });
    expect(s.contactName).toBeUndefined();
    expect(s.phone).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    const r = supplierCreateSchema.safeParse({ name: "ACME", email: "not-an-email" });
    expect(r.success).toBe(false);
  });

  it("requires a name", () => {
    const r = supplierCreateSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });
});

describe("poCreateSchema", () => {
  it("normalises line costs to centavos and defaults status to ordered", () => {
    const po = poCreateSchema.parse({
      orderDate: "2026-06-11",
      items: [{ name: "Arabica beans 1kg", qty: 10, unitCost: 450 }],
    });
    expect(po.status).toBe("ordered");
    expect(po.items[0].unitCost).toBe(45000);
    expect(po.items[0].qty).toBe(10);
  });

  it("requires at least one line item", () => {
    const r = poCreateSchema.safeParse({ orderDate: "2026-06-11", items: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    const r = poCreateSchema.safeParse({
      orderDate: "2026-06-11",
      items: [{ name: "X", qty: 0, unitCost: 100 }],
    });
    expect(r.success).toBe(false);
  });

  it("coerces an empty supplierId to null", () => {
    const po = poCreateSchema.parse({
      supplierId: "",
      orderDate: "2026-06-11",
      items: [{ name: "X", qty: 1, unitCost: 100 }],
    });
    expect(po.supplierId).toBeNull();
  });
});
