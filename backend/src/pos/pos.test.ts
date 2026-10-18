import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  computeSeniorPwdBreakdown,
  computeVatBreakdown,
  discountLabelFor,
  orderSchema,
  priceCart,
  type VatClass,
} from "./pos.schema.js";

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

  it("accepts a member discount and a numeric reference", () => {
    const parsed = orderSchema.safeParse({ ...base, referenceCode: "4821", discount: { type: "member" } });
    expect(parsed.success).toBe(true);
  });

  // Cashiers can't key their own discount amount — the free-form shapes are gone.
  it("rejects a free-form percent discount", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "percent", value: 20 } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a free-form fixed (centavos) discount", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "fixed", value: 5000 } });
    expect(parsed.success).toBe(false);
  });

  it("strips a client-supplied amount from a member discount", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "member", pct: 90 } });
    expect(parsed.success && parsed.data.discount).toEqual({ type: "member" });
  });

  it("accepts a promo by id only, and drops any amount the till tries to send", () => {
    const parsed = orderSchema.safeParse({
      ...base,
      discount: { type: "promo", promoId: "22222222-2222-2222-2222-222222222222", value: 100, kind: "percent" },
    });
    expect(parsed.success && parsed.data.discount).toEqual({
      type: "promo",
      promoId: "22222222-2222-2222-2222-222222222222",
    });
  });

  it("rejects a promo without a valid id", () => {
    expect(orderSchema.safeParse({ ...base, discount: { type: "promo", promoId: "abc" } }).success).toBe(false);
  });

  it("rejects two discounts at once (one discount object per sale)", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: [{ type: "member" }, { type: "member" }] });
    expect(parsed.success).toBe(false);
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

describe("computeVatBreakdown — per-class VAT summary", () => {
  it("books a wholly VATable cart exactly like the old single-rate path", () => {
    const b = computeVatBreakdown([{ vatClass: "VATABLE", grossCents: 15000 }]);
    expect(b.netCents).toBe(15000);
    expect(b.vatCents).toBe(1607);
    expect(b.vatableSalesCents).toBe(13393);
    expect(b.vatExemptCents).toBe(0);
    expect(b.zeroRatedCents).toBe(0);
    expect(b.subtotalCents).toBe(13393);
  });

  it("charges no VAT on exempt or zero-rated lines", () => {
    const b = computeVatBreakdown([
      { vatClass: "EXEMPT", grossCents: 8000 },
      { vatClass: "ZERO_RATED", grossCents: 5000 },
    ]);
    expect(b.vatCents).toBe(0);
    expect(b.vatExemptCents).toBe(8000);
    expect(b.zeroRatedCents).toBe(5000);
    expect(b.vatableSalesCents).toBe(0);
    expect(b.netCents).toBe(13000);
  });

  it("splits a mixed cart, VAT only on the VATable portion", () => {
    const b = computeVatBreakdown([
      { vatClass: "VATABLE", grossCents: 15000 },
      { vatClass: "EXEMPT", grossCents: 10000 },
      { vatClass: "ZERO_RATED", grossCents: 5000 },
    ]);
    expect(b.netCents).toBe(30000);
    expect(b.vatCents).toBe(1607); // from the ₱150 VATable share only
    expect(b.vatableSalesCents).toBe(13393);
    expect(b.vatExemptCents).toBe(10000);
    expect(b.zeroRatedCents).toBe(5000);
    // The parts always reconstitute the net.
    expect(b.vatableSalesCents + b.vatCents + b.vatExemptCents + b.zeroRatedCents).toBe(b.netCents);
  });

  it("allocates a cart discount across classes in proportion to gross", () => {
    // ₱300 gross (half VATable, half exempt), ₱30 discount → ₱270 net.
    // Each class sheds ₱15: VATable 150→135, exempt 150→135.
    const b = computeVatBreakdown(
      [
        { vatClass: "VATABLE", grossCents: 15000 },
        { vatClass: "EXEMPT", grossCents: 15000 },
      ],
      3000,
    );
    expect(b.netCents).toBe(27000);
    expect(b.vatExemptCents).toBe(13500);
    expect(b.vatCents).toBe(Math.round((13500 * 12) / 112)); // 1446
    expect(b.vatableSalesCents + b.vatCents).toBe(13500);
    expect(b.vatableSalesCents + b.vatCents + b.vatExemptCents).toBe(b.netCents);
  });

  it("never leaks a centavo: parts reconstitute the net under a full discount", () => {
    const b = computeVatBreakdown(
      [
        { vatClass: "VATABLE", grossCents: 9999 },
        { vatClass: "EXEMPT", grossCents: 1 },
      ],
      10000,
    );
    expect(b.netCents).toBe(0);
    expect(b.vatableSalesCents + b.vatCents + b.vatExemptCents + b.zeroRatedCents).toBe(0);
  });
});

describe("computeSeniorPwdBreakdown — VAT-exempt first, then 20%", () => {
  it("strips the 12% VAT before the 20% on a wholly-VATable cart", () => {
    // ₱112.00 VAT-inclusive → net of VAT ₱100.00 → less 20% → ₱80.00 due, ₱0 VAT.
    const r = computeSeniorPwdBreakdown([{ vatClass: "VATABLE", grossCents: 11200 }]);
    expect(r.grossInclCents).toBe(11200);
    expect(r.vatExemptedCents).toBe(1200);
    expect(r.seniorDiscountCents).toBe(2000);
    expect(r.totalDueCents).toBe(8000);
    expect(r.breakdown.vatCents).toBe(0);
    expect(r.breakdown.vatExemptCents).toBe(8000);
    expect(r.breakdown.vatableSalesCents).toBe(0);
  });

  it("is NOT the old flat 20%-off-gross (which overcharged the senior)", () => {
    const r = computeSeniorPwdBreakdown([{ vatClass: "VATABLE", grossCents: 11200 }]);
    const oldFlat = Math.round((11200 * 80) / 100); // 8960 — the wrong amount
    expect(r.totalDueCents).toBe(8000);
    expect(r.totalDueCents).toBeLessThan(oldFlat);
  });

  it("preserves gross = total + discount so every report reconstructs it", () => {
    const r = computeSeniorPwdBreakdown([{ vatClass: "VATABLE", grossCents: 11200 }]);
    expect(r.totalDueCents + r.discountCents).toBe(r.grossInclCents);
    expect(r.discountCents).toBe(r.vatExemptedCents + r.seniorDiscountCents);
  });

  it("only strips VAT from VATable lines; exempt lines keep their value but still earn 20%", () => {
    // ₱112 VATable (net ₱100) + ₱50 exempt (no VAT) → base ₱150 → less 20% ₱30 → ₱120 due.
    const r = computeSeniorPwdBreakdown([
      { vatClass: "VATABLE", grossCents: 11200 },
      { vatClass: "EXEMPT", grossCents: 5000 },
    ]);
    expect(r.vatExemptedCents).toBe(1200); // only the VATable line shed VAT
    expect(r.seniorDiscountCents).toBe(3000); // 20% of the ₱150 net-of-VAT base
    expect(r.totalDueCents).toBe(12000);
    expect(r.breakdown.vatCents).toBe(0);
  });

  it("folds a loyalty redemption on top of the 20%, clamped to the net", () => {
    // ₱80 due after the statutory 20%; redeem ₱10 more → ₱70 due.
    const r = computeSeniorPwdBreakdown([{ vatClass: "VATABLE", grossCents: 11200 }], 1000);
    expect(r.totalDueCents).toBe(7000);
    expect(r.totalDueCents + r.discountCents).toBe(r.grossInclCents);
  });

  it("never leaks a centavo under exemption: parts reconstitute the net", () => {
    const r = computeSeniorPwdBreakdown([
      { vatClass: "VATABLE", grossCents: 9999 },
      { vatClass: "ZERO_RATED", grossCents: 1 },
    ]);
    const b = r.breakdown;
    expect(b.vatableSalesCents + b.vatCents + b.vatExemptCents + b.zeroRatedCents).toBe(b.netCents);
    expect(b.netCents).toBe(r.totalDueCents);
  });
});

describe("Senior/PWD discount validation", () => {
  const base = {
    items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 1 }],
    paymentMethod: "Cash" as const,
  };

  const card = { idNumber: "OSCA-12345", holderName: "Juan Dela Cruz", exclusiveUse: true };

  it.each(["senior", "pwd"])("accepts a %s discount carrying ID, name and exclusive-use", (type) => {
    expect(orderSchema.safeParse({ ...base, discount: { type, ...card } }).success).toBe(true);
  });

  it("rejects the legacy combined senior_pwd type", () => {
    expect(orderSchema.safeParse({ ...base, discount: { type: "senior_pwd", ...card } }).success).toBe(false);
  });

  it("rejects a senior discount missing the ID number", () => {
    const { idNumber: _omit, ...noId } = card;
    expect(orderSchema.safeParse({ ...base, discount: { type: "senior", ...noId } }).success).toBe(false);
  });

  it("rejects a pwd discount with a blank holder name", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "pwd", ...card, holderName: "  " } });
    expect(parsed.success).toBe(false);
  });

  it("rejects a senior discount without the exclusive-use confirmation", () => {
    const parsed = orderSchema.safeParse({ ...base, discount: { type: "senior", ...card, exclusiveUse: false } });
    expect(parsed.success).toBe(false);
  });
});

describe("priceCart — server-side discount pricing", () => {
  const vatable = (grossCents: number, scPwdEligible = true) => ({
    vatClass: "VATABLE" as VatClass,
    grossCents,
    scPwdEligible,
  });
  const noPoints = { requestedPoints: 0, pointsBalance: 0, pointValueCents: 100 };

  it("charges full price with no discount", () => {
    const r = priceCart({ lines: [vatable(11_200)], discount: null, ...noPoints });
    expect(r.netCents).toBe(11_200);
    expect(r.discountCents).toBe(0);
    expect(r.vatCents).toBe(1_200);
  });

  it("senior: strips VAT then takes 20% (₱112 → ₱80)", () => {
    const r = priceCart({ lines: [vatable(11_200)], discount: { kind: "senior" }, ...noPoints });
    expect(r.netCents).toBe(8_000);
    expect(r.vatCents).toBe(0);
    expect(r.discountCents).toBe(3_200);
    expect(r.eligibleLineCount).toBe(1);
  });

  it("matches the legacy senior math exactly when every line is eligible", () => {
    const lines = [vatable(11_200), { vatClass: "EXEMPT" as VatClass, grossCents: 5_000, scPwdEligible: true }];
    const r = priceCart({ lines, discount: { kind: "pwd" }, ...noPoints });
    expect(r.netCents).toBe(computeSeniorPwdBreakdown(lines).totalDueCents);
  });

  it("senior: ineligible lines are charged in full with their VAT intact", () => {
    // ₱112 eligible → ₱80; ₱224 alcohol (ineligible) stays ₱224 with ₱24 VAT.
    const r = priceCart({
      lines: [vatable(11_200), vatable(22_400, false)],
      discount: { kind: "senior" },
      ...noPoints,
    });
    expect(r.netCents).toBe(8_000 + 22_400);
    expect(r.vatCents).toBe(2_400);
    expect(r.eligibleLineCount).toBe(1);
  });

  it("senior with no eligible lines reports zero eligible (checkout rejects it)", () => {
    const r = priceCart({ lines: [vatable(10_000, false)], discount: { kind: "senior" }, ...noPoints });
    expect(r.eligibleLineCount).toBe(0);
    expect(r.netCents).toBe(10_000);
  });

  it("member: takes the configured % off the gross", () => {
    const r = priceCart({ lines: [vatable(20_000)], discount: { kind: "member", pct: 5 }, ...noPoints });
    expect(r.netCents).toBe(19_000);
    expect(r.discountCents).toBe(1_000);
  });

  it("promo: a % promo comes off the gross", () => {
    const r = priceCart({
      lines: [vatable(20_000)],
      discount: { kind: "promo", name: "Payday", promoKind: "percent", value: 10 },
      ...noPoints,
    });
    expect(r.netCents).toBe(18_000);
  });

  it("promo: a fixed promo never drives the total below zero", () => {
    const r = priceCart({
      lines: [vatable(3_000)],
      discount: { kind: "promo", name: "₱50 off", promoKind: "fixed", value: 5_000 },
      ...noPoints,
    });
    expect(r.netCents).toBe(0);
    expect(r.discountCents).toBe(3_000);
  });

  it("points: clamped to balance and payable, valued by the tenant rate", () => {
    const r = priceCart({
      lines: [vatable(1_000)],
      discount: null,
      requestedPoints: 500,
      pointsBalance: 300,
      pointValueCents: 200, // 1 pt = ₱2 → at most 5 pts fit a ₱10 bill
    });
    expect(r.pointsRedeemed).toBe(5);
    expect(r.netCents).toBe(0);
  });

  it("points stack on senior without driving either part negative", () => {
    const r = priceCart({
      lines: [vatable(11_200), vatable(1_000, false)],
      discount: { kind: "senior" },
      requestedPoints: 1_000,
      pointsBalance: 1_000,
      pointValueCents: 100,
    });
    expect(r.pointsRedeemed).toBe(90); // ₱80 + ₱10 payable
    expect(r.netCents).toBe(0);
    expect(r.vatCents).toBe(0);
  });

  it("keeps gross = net + discount for every shape", () => {
    for (const discount of [null, { kind: "senior" as const }, { kind: "member" as const, pct: 7 }]) {
      const r = priceCart({
        lines: [vatable(9_999), vatable(3_333, false), { vatClass: "ZERO_RATED", grossCents: 1_234, scPwdEligible: true }],
        discount,
        requestedPoints: 13,
        pointsBalance: 13,
        pointValueCents: 100,
      });
      expect(r.netCents + r.discountCents).toBe(r.grossCents);
      expect(r.vatableSalesCents + r.vatCents + r.vatExemptCents + r.zeroRatedCents).toBe(r.netCents);
    }
  });
});

describe("discountLabelFor", () => {
  it("labels each category and appends redeemed points", () => {
    expect(discountLabelFor({ kind: "senior" }, 0)).toBe("Senior Citizen (20% + VAT-exempt)");
    expect(discountLabelFor({ kind: "pwd" }, 1)).toBe("PWD (20% + VAT-exempt) + 1 pt redeemed");
    expect(discountLabelFor({ kind: "member", pct: 5 }, 0)).toBe("Member 5% off");
    expect(discountLabelFor({ kind: "promo", name: "Payday", promoKind: "percent", value: 10 }, 2)).toBe(
      "Payday + 2 pts redeemed",
    );
    expect(discountLabelFor(null, 0)).toBeNull();
  });
});
