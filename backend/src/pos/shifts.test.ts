import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  buildAuditSnapshot,
  reconcile,
  shiftCloseSchema,
  shiftOpenSchema,
  type ShiftAuditInput,
} from "./pos.schema.js";

const app = createApp();

describe("Shift endpoints require a till session", () => {
  it("blocks reading the active shift unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/pos/shifts/active");
    expect(res.status).toBe(401);
  });

  it("blocks opening a shift unauthenticated with 401", async () => {
    const res = await request(app).post("/api/v1/pos/shifts/open").send({ openingCents: 50000 });
    expect(res.status).toBe(401);
  });

  it("blocks closing a shift unauthenticated with 401", async () => {
    const res = await request(app).post("/api/v1/pos/shifts/close").send({ countedCents: 50000 });
    expect(res.status).toBe(401);
  });
});

describe("Shift payload validation", () => {
  it("accepts a non-negative integer opening float", () => {
    expect(shiftOpenSchema.safeParse({ openingCents: 100000 }).success).toBe(true);
    expect(shiftOpenSchema.safeParse({ openingCents: 0 }).success).toBe(true);
  });

  it("rejects a negative or non-integer opening float", () => {
    expect(shiftOpenSchema.safeParse({ openingCents: -1 }).success).toBe(false);
    expect(shiftOpenSchema.safeParse({ openingCents: 100.5 }).success).toBe(false);
  });

  it("accepts a counted amount with an optional note", () => {
    expect(shiftCloseSchema.safeParse({ countedCents: 73450 }).success).toBe(true);
    expect(shiftCloseSchema.safeParse({ countedCents: 73450, note: "₱20 short" }).success).toBe(true);
  });

  it("rejects a negative counted amount", () => {
    expect(shiftCloseSchema.safeParse({ countedCents: -50 }).success).toBe(false);
  });
});

describe("reconcile() — cash variance to the centavo", () => {
  it("expects opening float + cash sales, and balances exactly", () => {
    const r = reconcile(100000, 234550, 334550);
    expect(r.expectedCashCents).toBe(334550);
    expect(r.cashVarianceCents).toBe(0);
  });

  it("reports a positive variance as an overage", () => {
    const r = reconcile(100000, 50000, 150075); // ₱0.75 over
    expect(r.expectedCashCents).toBe(150000);
    expect(r.cashVarianceCents).toBe(75);
  });

  it("reports a negative variance as a shortage", () => {
    const r = reconcile(100000, 50000, 149950); // ₱0.50 short
    expect(r.cashVarianceCents).toBe(-50);
  });

  it("ignores digital channels — only cash drives the drawer", () => {
    // e-wallet/card revenue never lands in the physical drawer, so it must not
    // affect the expected cash figure.
    const r = reconcile(50000, 0, 50000);
    expect(r.cashVarianceCents).toBe(0);
  });
});

describe("buildAuditSnapshot() — immutable Z-Read line", () => {
  const base: ShiftAuditInput = {
    cashierName: "Maria Santos",
    openedAt: "2026-06-11T01:00:00.000Z",
    closedAt: "2026-06-11T09:30:00.000Z",
    openingCents: 100000,
    cashSalesCents: 234550,
    ewalletSalesCents: 50000,
    cardSalesCents: 12500,
    totalSalesCents: 297050,
    txnCount: 42,
    expectedCashCents: 334550,
    countedCashCents: 334550,
    cashVarianceCents: 0,
    note: null,
  };

  it("states expected and counted to the exact centavo and marks a balanced drawer", () => {
    const line = buildAuditSnapshot(base);
    expect(line).toContain("expected drawer ₱3,345.50");
    expect(line).toContain("counted ₱3,345.50");
    expect(line).toContain("variance BALANCED ₱0.00");
  });

  it("labels a positive variance as an overage with a signed peso figure", () => {
    const line = buildAuditSnapshot({ ...base, countedCashCents: 334625, cashVarianceCents: 75 });
    expect(line).toContain("variance OVERAGE +₱0.75");
  });

  it("labels a negative variance as a shortage and appends the note", () => {
    const line = buildAuditSnapshot({
      ...base,
      countedCashCents: 334500,
      cashVarianceCents: -50,
      note: "₱0.50 short — wrong change",
    });
    expect(line).toContain("variance SHORTAGE -₱0.50");
    expect(line).toContain("note: ₱0.50 short — wrong change");
  });

  it("singularises the txn count when there was exactly one sale", () => {
    expect(buildAuditSnapshot({ ...base, txnCount: 1 })).toContain("(1 txn)");
    expect(buildAuditSnapshot({ ...base, txnCount: 2 })).toContain("(2 txns)");
  });
});
