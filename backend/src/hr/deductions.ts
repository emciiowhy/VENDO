/**
 * Philippine statutory payroll deductions — the EMPLOYEE share only (what's
 * withheld from take-home pay). Lifts the HR module's gross-only v1 limitation
 * to a gross → net computation.
 *
 * All money is integer centavos. Every function is PURE and deterministic — the
 * rate tables below are the single source of truth, isolated here so a bracket
 * revision is a one-file edit (DB-backed editable tables are a possible
 * follow-up). Rates reflect the 2025 schedules:
 *   - SSS:       EE share 5% of the Monthly Salary Credit (MSC ₱5,000–₱35,000).
 *   - PhilHealth: 5% premium split 50/50 → EE 2.5%, salary floor ₱10k, ceil ₱100k.
 *   - Pag-IBIG:  EE 1% (≤₱1,500 comp) or 2%, on a base capped at ₱5,000 (max ₱100).
 *   - BIR:       TRAIN graduated MONTHLY withholding on taxable = gross − the three above.
 *
 * ASSUMPTION: the input is one month's compensation basis. Statutory
 * contributions are inherently monthly, so a payroll run is treated as a monthly
 * pay period (the common case). Non-monthly runs apply the monthly figure.
 */

const PESO = 100;

// ── Rate tables (2025) ────────────────────────────────────────────────────────

export const SSS_2025 = {
  employeeRate: 0.05,
  mscMinCents: 5_000 * PESO,
  mscMaxCents: 35_000 * PESO,
  mscStepCents: 500 * PESO,
} as const;

export const PHILHEALTH_2025 = {
  employeeRate: 0.025, // half of the 5% premium
  floorCents: 10_000 * PESO,
  ceilingCents: 100_000 * PESO,
} as const;

export const PAGIBIG_2025 = {
  lowRate: 0.01, // monthly compensation ≤ ₱1,500
  highRate: 0.02,
  lowThresholdCents: 1_500 * PESO,
  baseCapCents: 5_000 * PESO, // contributions computed on at most ₱5,000 → max ₱100
} as const;

/**
 * TRAIN graduated monthly withholding brackets. Each: tax = baseCents + rate ×
 * (taxable − floorCents), for taxable in [floorCents, next floor).
 */
export const BIR_WITHHOLDING_2025 = [
  { floorCents: 0, baseCents: 0, rate: 0 },
  { floorCents: 20_833 * PESO, baseCents: 0, rate: 0.15 },
  { floorCents: 33_333 * PESO, baseCents: 1_875 * PESO, rate: 0.2 },
  { floorCents: 66_667 * PESO, baseCents: 854_180, rate: 0.25 }, // ₱8,541.80
  { floorCents: 166_667 * PESO, baseCents: 3_354_180, rate: 0.3 }, // ₱33,541.80
  { floorCents: 666_667 * PESO, baseCents: 18_354_180, rate: 0.35 }, // ₱183,541.80
] as const;

// ── Per-contribution employee share ───────────────────────────────────────────

/** Round a monthly gross to its SSS Monthly Salary Credit (₱500 bands, clamped). */
export function sssMonthlySalaryCreditCents(monthlyGrossCents: number): number {
  const { mscMinCents, mscMaxCents, mscStepCents } = SSS_2025;
  if (monthlyGrossCents <= mscMinCents) return mscMinCents;
  if (monthlyGrossCents >= mscMaxCents) return mscMaxCents;
  const stepped = Math.round(monthlyGrossCents / mscStepCents) * mscStepCents;
  return Math.min(Math.max(stepped, mscMinCents), mscMaxCents);
}

export function sssEmployeeShareCents(monthlyGrossCents: number): number {
  return Math.round(sssMonthlySalaryCreditCents(monthlyGrossCents) * SSS_2025.employeeRate);
}

export function philhealthEmployeeShareCents(monthlyGrossCents: number): number {
  const base = Math.min(Math.max(monthlyGrossCents, PHILHEALTH_2025.floorCents), PHILHEALTH_2025.ceilingCents);
  return Math.round(base * PHILHEALTH_2025.employeeRate);
}

export function pagibigEmployeeShareCents(monthlyGrossCents: number): number {
  const rate = monthlyGrossCents <= PAGIBIG_2025.lowThresholdCents ? PAGIBIG_2025.lowRate : PAGIBIG_2025.highRate;
  const base = Math.min(monthlyGrossCents, PAGIBIG_2025.baseCapCents);
  return Math.round(base * rate);
}

/** Graduated monthly withholding tax on an already-net-of-contributions taxable base. */
export function withholdingTaxCents(taxableCents: number): number {
  if (taxableCents <= 0) return 0;
  let bracket: { floorCents: number; baseCents: number; rate: number } = BIR_WITHHOLDING_2025[0];
  for (const b of BIR_WITHHOLDING_2025) {
    if (taxableCents >= b.floorCents) bracket = b;
    else break;
  }
  return Math.round(bracket.baseCents + bracket.rate * (taxableCents - bracket.floorCents));
}

// ── Full breakdown ─────────────────────────────────────────────────────────────

export interface DeductionBreakdown {
  /** The monthly compensation basis the deductions were computed from. */
  basisCents: number;
  sssCents: number;
  philhealthCents: number;
  pagibigCents: number;
  /** Gross minus the three mandatory contributions — the withholding-tax base. */
  taxableCents: number;
  withholdingTaxCents: number;
  /** SSS + PhilHealth + Pag-IBIG + withholding tax. */
  totalDeductionsCents: number;
  /** Gross minus all deductions — take-home pay. */
  netCents: number;
}

/**
 * Compute the full employee-side deduction breakdown + net pay for one month's
 * gross. Withholding tax is computed on gross minus the three mandatory
 * contributions (the statutory taxable base).
 */
export function computeDeductions(monthlyGrossCents: number): DeductionBreakdown {
  const gross = Math.max(0, Math.round(monthlyGrossCents));
  // No compensation in the run → no contributions. Skips the statutory floors
  // (SSS/PhilHealth minimums), which would otherwise withhold from zero pay and
  // drive net negative for an employee who earned nothing this period.
  if (gross === 0) {
    return {
      basisCents: 0,
      sssCents: 0,
      philhealthCents: 0,
      pagibigCents: 0,
      taxableCents: 0,
      withholdingTaxCents: 0,
      totalDeductionsCents: 0,
      netCents: 0,
    };
  }
  const sss = sssEmployeeShareCents(gross);
  const philhealth = philhealthEmployeeShareCents(gross);
  const pagibig = pagibigEmployeeShareCents(gross);
  const taxable = Math.max(0, gross - sss - philhealth - pagibig);
  const tax = withholdingTaxCents(taxable);
  const total = sss + philhealth + pagibig + tax;
  return {
    basisCents: gross,
    sssCents: sss,
    philhealthCents: philhealth,
    pagibigCents: pagibig,
    taxableCents: taxable,
    withholdingTaxCents: tax,
    totalDeductionsCents: total,
    netCents: gross - total,
  };
}
