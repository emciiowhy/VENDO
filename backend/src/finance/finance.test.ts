import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { expenseCreateSchema } from "./finance.schema.js";

const app = createApp();

describe("Finance routes require store-management auth", () => {
  it("blocks the P&L summary for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/finance/summary");
    expect(res.status).toBe(401);
  });

  it("blocks listing expenses for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/finance/expenses");
    expect(res.status).toBe(401);
  });

  it("blocks recording an expense for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post("/api/v1/finance/expenses")
      .send({ incurredOn: "2026-06-01", category: "Rent", amount: 15000 });
    expect(res.status).toBe(401);
  });
});

describe("expenseCreateSchema", () => {
  it("normalises a peso amount (number or string) to integer centavos", () => {
    const a = expenseCreateSchema.parse({ incurredOn: "2026-06-11", category: "Rent", amount: 1500 });
    expect(a.amount).toBe(150000);
    const b = expenseCreateSchema.parse({
      incurredOn: "2026-06-11",
      category: "Utilities",
      amount: "₱1,250.50",
    });
    expect(b.amount).toBe(125050);
  });

  it("defaults the payment method to Cash", () => {
    const e = expenseCreateSchema.parse({ incurredOn: "2026-06-11", category: "Supplies", amount: 200 });
    expect(e.paymentMethod).toBe("Cash");
  });

  it("rejects an unknown category", () => {
    const r = expenseCreateSchema.safeParse({
      incurredOn: "2026-06-11",
      category: "Yacht",
      amount: 200,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const r = expenseCreateSchema.safeParse({ incurredOn: "06/11/2026", category: "Rent", amount: 200 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const r = expenseCreateSchema.safeParse({ incurredOn: "2026-06-11", category: "Rent", amount: -5 });
    expect(r.success).toBe(false);
  });

  it("coerces empty optional text to undefined", () => {
    const e = expenseCreateSchema.parse({
      incurredOn: "2026-06-11",
      category: "Rent",
      amount: 200,
      payee: "",
      note: "",
    });
    expect(e.payee).toBeUndefined();
    expect(e.note).toBeUndefined();
  });
});
