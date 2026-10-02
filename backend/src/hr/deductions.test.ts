import { describe, it, expect } from "vitest";
import {
  computeDeductions,
  pagibigEmployeeShareCents,
  philhealthEmployeeShareCents,
  sssEmployeeShareCents,
  sssMonthlySalaryCreditCents,
  withholdingTaxCents,
} from "./deductions.js";

/** Pesos → integer centavos. */
const p = (n: number) => Math.round(n * 100);

describe("SSS employee share (5% of the Monthly Salary Credit)", () => {
  it("floors the MSC at ₱5,000 for low earners", () => {
    expect(sssMonthlySalaryCreditCents(p(3_000))).toBe(p(5_000));
    expect(sssEmployeeShareCents(p(3_000))).toBe(p(250));
  });

  it("caps the MSC at ₱35,000 for high earners", () => {
    expect(sssMonthlySalaryCreditCents(p(60_000))).toBe(p(35_000));
    expect(sssEmployeeShareCents(p(60_000))).toBe(p(1_750));
  });

  it("uses the salary's MSC band in range", () => {
    expect(sssEmployeeShareCents(p(20_000))).toBe(p(1_000));
  });
});

describe("PhilHealth employee share (2.5%, floor ₱10k, ceiling ₱100k)", () => {
  it("applies the floor below ₱10,000", () => {
    expect(philhealthEmployeeShareCents(p(5_000))).toBe(p(250));
  });
  it("applies 2.5% in range", () => {
    expect(philhealthEmployeeShareCents(p(20_000))).toBe(p(500));
  });
  it("applies the ceiling above ₱100,000", () => {
    expect(philhealthEmployeeShareCents(p(200_000))).toBe(p(2_500));
  });
});

describe("Pag-IBIG employee share (1%/2%, base capped at ₱5,000)", () => {
  it("uses 1% at or below ₱1,500", () => {
    expect(pagibigEmployeeShareCents(p(1_500))).toBe(p(15));
  });
  it("uses 2% above ₱1,500, capping the base at ₱5,000", () => {
    expect(pagibigEmployeeShareCents(p(20_000))).toBe(p(100));
  });
});

describe("BIR graduated monthly withholding tax", () => {
  it("is zero at or below the ₱20,833 exemption", () => {
    expect(withholdingTaxCents(p(20_000))).toBe(0);
    expect(withholdingTaxCents(p(20_833))).toBe(0);
  });
  it("applies 15% of the excess in the first taxable band", () => {
    // 15% of (25,000 − 20,833) = 15% × 4,167 = ₱625.05
    expect(withholdingTaxCents(p(25_000))).toBe(p(625.05));
  });
  it("applies the ₱1,875 + 20% band", () => {
    // 1,875 + 20% × (46,900 − 33,333) = 1,875 + 2,713.40 = ₱4,588.40
    expect(withholdingTaxCents(p(46_900))).toBe(p(4_588.4));
  });
});

describe("computeDeductions — full gross→net breakdown", () => {
  it("nets a ₱20,000 earner (tax-free after contributions)", () => {
    const d = computeDeductions(p(20_000));
    expect(d.sssCents).toBe(p(1_000));
    expect(d.philhealthCents).toBe(p(500));
    expect(d.pagibigCents).toBe(p(100));
    expect(d.taxableCents).toBe(p(18_400));
    expect(d.withholdingTaxCents).toBe(0);
    expect(d.totalDeductionsCents).toBe(p(1_600));
    expect(d.netCents).toBe(p(18_400));
  });

  it("nets a ₱50,000 earner across SSS cap + a tax band", () => {
    const d = computeDeductions(p(50_000));
    expect(d.sssCents).toBe(p(1_750)); // MSC capped at 35k
    expect(d.philhealthCents).toBe(p(1_250));
    expect(d.pagibigCents).toBe(p(100));
    expect(d.taxableCents).toBe(p(46_900));
    expect(d.withholdingTaxCents).toBe(p(4_588.4));
    expect(d.totalDeductionsCents).toBe(p(7_688.4));
    expect(d.netCents).toBe(p(42_311.6));
  });

  it("is all-zero for zero gross and never returns a negative net", () => {
    const d = computeDeductions(0);
    expect(d.totalDeductionsCents).toBe(0);
    expect(d.netCents).toBe(0);
  });

  it("keeps net = gross − total deductions (centavo-exact)", () => {
    for (const g of [8_000, 15_250, 33_400, 75_000, 120_000]) {
      const d = computeDeductions(p(g));
      expect(d.netCents).toBe(d.basisCents - d.totalDeductionsCents);
      expect(d.totalDeductionsCents).toBe(
        d.sssCents + d.philhealthCents + d.pagibigCents + d.withholdingTaxCents,
      );
    }
  });
});
