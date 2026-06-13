import { describe, it, expect } from "vitest";
import { computeRefund, returnSchema, voidSchema } from "./refunds.schema.js";

describe("Void / Return request validation", () => {
  it("accepts a void with an optional reason", () => {
    expect(voidSchema.safeParse({ reason: "Wrong item rung up" }).success).toBe(true);
    expect(voidSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a return with one or more lines", () => {
    const parsed = returnSchema.safeParse({
      lines: [{ saleItemId: "11111111-1111-1111-1111-111111111111", qty: 2 }],
      reason: "Damaged",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a return with no lines", () => {
    expect(returnSchema.safeParse({ lines: [] }).success).toBe(false);
  });

  it("rejects a non-positive return quantity", () => {
    const parsed = returnSchema.safeParse({
      lines: [{ saleItemId: "11111111-1111-1111-1111-111111111111", qty: 0 }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("computeRefund — no discount on the original sale", () => {
  it("splits 12% inclusive VAT out of a plain ₱150 return", () => {
    // Returning items worth ₱150 gross, original had no discount.
    const r = computeRefund({
      returnedGrossCents: 15000,
      originalTotalCents: 15000,
      originalDiscountCents: 0,
    });
    expect(r.discountShareCents).toBe(0);
    expect(r.refundNetCents).toBe(15000);
    expect(r.refundVatCents).toBe(1607); // round(15000 × 12/112)
    expect(r.refundSubtotalCents).toBe(13393);
  });
});

describe("computeRefund — discount reversed pro-rata", () => {
  it("claws back only the returned items' share of the cart discount", () => {
    // Original: ₱200 gross, ₱20 discount → ₱180 net charged.
    // Return half the gross (₱100) → discount share = 20 × 100/200 = ₱10.
    const r = computeRefund({
      returnedGrossCents: 10000,
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
    const r = computeRefund({ returnedGrossCents: 20000, ...original });
    expect(r.discountShareCents).toBe(2000);
    expect(r.refundNetCents).toBe(18000); // exactly the net that was charged
  });
});
