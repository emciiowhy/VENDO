import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { orderSchema } from "./pos.schema.js";

const app = createApp();

describe("POS endpoints require a till session", () => {
  it("blocks unauthenticated catalog reads with 401", async () => {
    const res = await request(app).get("/api/v1/pos/catalog");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("blocks unauthenticated checkouts with 401", async () => {
    const res = await request(app)
      .post("/api/v1/pos/orders")
      .send({ items: [{ productId: "00000000-0000-0000-0000-000000000000", qty: 1 }], paymentMethod: "Cash" });
    expect(res.status).toBe(401);
  });

  it("blocks unauthenticated cashier-profile reads with 401", async () => {
    const res = await request(app).get("/api/v1/pos/cashiers");
    expect(res.status).toBe(401);
  });
});

describe("Checkout utilities validation (discount + e-wallet reference)", () => {
  const base = {
    items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 1 }],
    paymentMethod: "GCash" as const,
  };

  it("accepts a percent discount and a numeric reference", () => {
    const parsed = orderSchema.safeParse({
      ...base,
      referenceCode: "4821",
      discount: { type: "percent", value: 20, label: "Senior/PWD 20%" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a fixed (centavos) discount", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "fixed", value: 5000 } });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-numeric reference code", () => {
    const parsed = orderSchema.safeParse({ ...base, referenceCode: "ab12" });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown discount type", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "bogus", value: 10 } });
    expect(parsed.success).toBe(false);
  });
});

describe("Order payload validation", () => {
  it("rejects an empty cart", () => {
    expect(orderSchema.safeParse({ items: [], paymentMethod: "Cash" }).success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    const parsed = orderSchema.safeParse({
      items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 0 }],
      paymentMethod: "GCash",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown payment method", () => {
    const parsed = orderSchema.safeParse({
      items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 1 }],
      paymentMethod: "Bitcoin",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a well-formed cash order", () => {
    const parsed = orderSchema.safeParse({
      items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 2 }],
      paymentMethod: "Cash",
      tenderedCents: 50000,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("VAT is 12% inclusive (vat = total × 12/112)", () => {
  it("extracts ₱16.07 VAT from a ₱150.00 inclusive total", () => {
    const totalCents = 15000;
    const vatCents = Math.round((totalCents * 12) / 112);
    expect(vatCents).toBe(1607);
    expect(totalCents - vatCents).toBe(13393);
  });
});
