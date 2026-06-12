import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { customerCreateSchema } from "./crm.schema.js";
import { orderSchema } from "../pos/pos.schema.js";

const app = createApp();
const UUID = "11111111-1111-1111-1111-111111111111";

describe("CRM routes require auth", () => {
  it("blocks the summary for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/crm/summary")).status).toBe(401);
  });
  it("blocks listing customers for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/crm/customers")).status).toBe(401);
  });
  it("blocks the POS customer search for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/crm/customers/search?q=ana")).status).toBe(401);
  });
  it("blocks creating a customer for the unauthenticated with 401", async () => {
    expect((await request(app).post("/api/v1/crm/customers").send({ name: "Ana" })).status).toBe(401);
  });
});

describe("customerCreateSchema", () => {
  it("accepts a minimal customer and dedupes tags", () => {
    const c = customerCreateSchema.parse({ name: "Ana Reyes", tags: ["vip", "vip", "regular"] });
    expect(c.name).toBe("Ana Reyes");
    expect(c.tags).toEqual(["vip", "regular"]);
  });
  it("collapses blank optional fields to undefined", () => {
    const c = customerCreateSchema.parse({ name: "Ana", phone: "", email: "" });
    expect(c.phone).toBeUndefined();
    expect(c.email).toBeUndefined();
  });
  it("rejects an empty name", () => {
    expect(customerCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejects a malformed email", () => {
    expect(customerCreateSchema.safeParse({ name: "Ana", email: "nope" }).success).toBe(false);
  });
});

describe("orderSchema accepts an optional CRM customer", () => {
  const base = { items: [{ productId: UUID, qty: 1 }], paymentMethod: "Cash" as const };

  it("parses a valid customerId", () => {
    const r = orderSchema.parse({ ...base, customerId: UUID });
    expect(r.customerId).toBe(UUID);
  });
  it("treats an empty customerId as undefined (walk-in)", () => {
    const r = orderSchema.parse({ ...base, customerId: "" });
    expect(r.customerId).toBeUndefined();
  });
  it("rejects a non-uuid customerId", () => {
    expect(orderSchema.safeParse({ ...base, customerId: "abc" }).success).toBe(false);
  });
});
