import { describe, it, expect } from "vitest";
import { buildBalanceSheet, buildCashFlow } from "./finance.reports.js";

describe("buildBalanceSheet", () => {
  const sheet = buildBalanceSheet("2026-06-13", {
    cashCents: 150000,
    inventoryValueCents: 90000,
    vatPayableCents: 24000,
    accountsPayableCents: 36000,
  });

  it("totals assets and liabilities from their line items", () => {
    expect(sheet.assets.totalCents).toBe(240000); // 150000 + 90000
    expect(sheet.liabilities.totalCents).toBe(60000); // 24000 + 36000
  });

  it("derives owner's equity as the residual and always balances", () => {
    expect(sheet.equity.totalCents).toBe(180000); // 240000 − 60000
    expect(sheet.balanced).toBe(true);
    expect(sheet.assets.totalCents).toBe(
      sheet.liabilities.totalCents + sheet.equity.totalCents,
    );
  });

  it("carries a negative equity when liabilities exceed assets", () => {
    const underwater = buildBalanceSheet("2026-06-13", {
      cashCents: 0,
      inventoryValueCents: 1000,
      vatPayableCents: 5000,
      accountsPayableCents: 0,
    });
    expect(underwater.equity.totalCents).toBe(-4000);
    expect(underwater.balanced).toBe(true);
  });
});

describe("buildCashFlow", () => {
  const cf = buildCashFlow("2026-06-01", "2026-06-30", {
    salesCollectedCents: 500000,
    expensesPaidCents: 120000,
    goodsReceivedCents: 80000,
    openingCashCents: 200000,
  });

  it("nets inflows against outflows for the period change", () => {
    expect(cf.netChangeCents).toBe(300000); // 500000 − (120000 + 80000)
  });

  it("reconciles opening + net change to closing cash", () => {
    expect(cf.closingCashCents).toBe(500000); // 200000 + 300000
    expect(cf.openingCashCents + cf.netChangeCents).toBe(cf.closingCashCents);
  });

  it("stores outflow amounts as positive magnitudes", () => {
    expect(cf.outflows.every((o) => o.amountCents >= 0)).toBe(true);
    expect(cf.outflows.map((o) => o.amountCents)).toEqual([120000, 80000]);
  });

  it("goes negative when outflows exceed inflows", () => {
    const tight = buildCashFlow("2026-06-01", "2026-06-30", {
      salesCollectedCents: 100000,
      expensesPaidCents: 150000,
      goodsReceivedCents: 0,
      openingCashCents: 60000,
    });
    expect(tight.netChangeCents).toBe(-50000);
    expect(tight.closingCashCents).toBe(10000);
  });
});
