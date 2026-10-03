import { describe, it, expect } from "vitest";
import {
  computeRefund,
  returnSchema,
  summarizeReversals,
  voidSchema,
} from "./refunds.schema.js";

describe("Void / Return request validation", () => {
  it("requires a reason on a void (accountability)", () => {
    expect(voidSchema.safeParse({ reason: "Wrong item rung up" }).success).toBe(true);
    expect(voidSchema.safeParse({}).success).toBe(false);
    expect(voidSchema.safeParse({ reason: "  " }).success).toBe(false);
  });

  it("accepts a return with one or more lines and a reason", () => {
    const parsed = returnSchema.safeParse({
      lines: [{ saleItemId: "11111111-1111-1111-1111-111111111111", qty: 2 }],
      reason: "Damaged",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a reason on a return", () => {
    expect(
      returnSchema.safeParse({
        lines: [{ saleItemId: "11111111-1111-1111-1111-111111111111", qty: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a return with no lines", () => {
    expect(returnSchema.safeParse({ lines: [], reason: "no lines" }).success).toBe(false);
  });

  it("rejects a non-positive return quantity", () => {
    const parsed = returnSchema.safeParse({
      lines: [{ saleItemId: "11111111-1111-1111-1111-111111111111", qty: 0 }],
      reason: "bad qty",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("summarizeReversals", () => {
  it("tallies voids, returns and the total refunded", () => {
    const s = summarizeReversals([
      { kind: "void", amountCents: 5000 },
      { kind: "return", amountCents: 1500 },
      { kind: "return", amountCents: 500 },
    ]);
    expect(s).toEqual({ total: 3, voids: 1, returns: 2, refundedCents: 7000 });
  });

  it("is zeroed for an empty window", () => {
    expect(summarizeReversals([])).toEqual({ total: 0, voids: 0, returns: 0, refundedCents: 0 });
  });
});

describe("computeRefund — no discount on the original sale", () => {
  it("splits 12% inclusive VAT out of a plain ₱150 VATable return", () => {
    // Returning items worth ₱150 gross, original had no discount.
    const r = computeRefund({
      returnedLines: [{ vatClass: "VATABLE", grossCents: 15000 }],
      originalTotalCents: 15000,
      originalDiscountCents: 0,
    });
    expect(r.discountShareCents).toBe(0);
    expect(r.refundNetCents).toBe(15000);
    expect(r.refundVatCents).toBe(1607); // round(15000 × 12/112)
    expect(r.refundSubtotalCents).toBe(13393);
    expect(r.refundVatableSalesCents).toBe(13393);
  });

  it("charges no VAT when the returned line is VAT-exempt", () => {
    const r = computeRefund({
      returnedLines: [{ vatClass: "EXEMPT", grossCents: 15000 }],
      originalTotalCents: 15000,
      originalDiscountCents: 0,
    });
    expect(r.refundNetCents).toBe(15000);
    expect(r.refundVatCents).toBe(0);
    expect(r.refundVatExemptCents).toBe(15000);
    expect(r.refundVatableSalesCents).toBe(0);
  });

  it("charges no VAT when the returned line is zero-rated", () => {
    const r = computeRefund({
      returnedLines: [{ vatClass: "ZERO_RATED", grossCents: 15000 }],
      originalTotalCents: 15000,
      originalDiscountCents: 0,
    });
    expect(r.refundVatCents).toBe(0);
    expect(r.refundZeroRatedCents).toBe(15000);
  });

  it("splits VAT across mixed classes (VAT only on the VATable portion)", () => {
    const r = computeRefund({
      returnedLines: [
        { vatClass: "VATABLE", grossCents: 15000 },
        { vatClass: "EXEMPT", grossCents: 10000 },
      ],
      originalTotalCents: 25000,
      originalDiscountCents: 0,
    });
    expect(r.refundNetCents).toBe(25000);
    expect(r.refundVatCents).toBe(1607); // only the ₱150 VATable share
    expect(r.refundVatExemptCents).toBe(10000);
    expect(r.refundVatableSalesCents).toBe(13393);
  });
});

describe("computeRefund — discount reversed pro-rata", () => {
  it("claws back only the returned items' share of the cart discount", () => {
    // Original: ₱200 gross, ₱20 discount → ₱180 net charged.
    // Return half the gross (₱100) → discount share = 20 × 100/200 = ₱10.
    const r = computeRefund({
      returnedLines: [{ vatClass: "VATABLE", grossCents: 10000 }],
      originalTotalCents: 18000, // net after discount
      originalDiscountCents: 2000,
    });
    expect(r.discountShareCents).toBe(1000); // ₱10
    expect(r.refundNetCents).toBe(9000); // ₱90
    expect(r.refundVatCents).toBe(964); // round(9000 × 12/112)
    expect(r.refundSubtotalCents).toBe(8036);
  });

  it("a full return reverses the entire discount and net", () => {
    const original = { originalTotalCents: 18000, originalDiscountCents: 2000 };
    const r = computeRefund({
      returnedLines: [{ vatClass: "VATABLE", grossCents: 20000 }],
      ...original,
    });
    expect(r.discountShareCents).toBe(2000);
    expect(r.refundNetCents).toBe(18000); // exactly the net that was charged
  });
});
