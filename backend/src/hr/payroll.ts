import type { AttendanceDay } from "./attendance.js";

/**
 * Payroll maths — pure and integer-centavo, so it is unit-tested directly
 * (payroll.test.ts) and every peso on a payslip can be traced to a formula:
 *
 *   Hourly rate          = Daily rate ÷ Standard daily hours
 *   Eligible regular hrs = each day's worked hours, capped at the standard day
 *   Base earnings        = Hourly rate × Eligible regular hours
 *                        = round(Daily rate × regular minutes ÷ (standard hours × 60))
 *   Final payable        = Base earnings + APPROVED adjustments
 *
 * Example (from the brief): ₱600/day, 8-hour standard, 6 hours worked →
 * 60000 × 360 ÷ 480 = 45000 centavos = ₱450.
 *
 * Overtime (hours past the standard day) and paid leave are NOT in base pay.
 * They come back as SUGGESTED adjustments the manager must approve, because
 * overtime has to be authorised and leave policy is the employer's call.
 * Statutory contributions (SSS, PhilHealth, Pag-IBIG) and withholding tax are
 * not computed — the employer handles them outside the system.
 */

/** Ordinary-day overtime premium (Labor Code Art. 87: +25% of the hourly rate). */
export const OVERTIME_MULTIPLIER = 1.25;

export interface PayLine {
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  needsReviewDays: number;
  workedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  baseCents: number;
  /** Suggested (unapproved) overtime pay at 125%. */
  overtimeCents: number;
  /** Suggested (unapproved) pay for leave days at the daily rate. */
  paidLeaveCents: number;
}

export function computePayLine(input: {
  days: AttendanceDay[];
  dailyRateCents: number;
  standardDailyHours: number;
}): PayLine {
  const stdMinutes = Math.round(input.standardDailyHours * 60);
  const rate = Math.max(0, Math.round(input.dailyRateCents));
  let regular = 0;
  let overtime = 0;
  let worked = 0;
  const count = { present: 0, half: 0, absent: 0, leave: 0, review: 0 };
  for (const d of input.days) {
    worked += d.workedMinutes;
    regular += Math.min(d.workedMinutes, stdMinutes);
    overtime += Math.max(d.workedMinutes - stdMinutes, 0);
    if (d.status === "present") count.present += 1;
    else if (d.status === "half_day") count.half += 1;
    else if (d.status === "absent") count.absent += 1;
    else if (d.status === "leave") count.leave += 1;
    else if (d.status === "needs_review") count.review += 1;
  }
  // One rounding per figure, at the centavo — never accumulated in floats.
  const perMinute = (minutes: number) => (stdMinutes > 0 ? (rate * minutes) / stdMinutes : 0);
  return {
    presentDays: count.present,
    halfDays: count.half,
    absentDays: count.absent,
    leaveDays: count.leave,
    needsReviewDays: count.review,
    workedMinutes: worked,
    regularMinutes: regular,
    overtimeMinutes: overtime,
    baseCents: Math.round(perMinute(regular)),
    overtimeCents: Math.round(perMinute(overtime) * OVERTIME_MULTIPLIER),
    paidLeaveCents: rate * count.leave,
  };
}

/**
 * A starting daily rate for an employee who has none confirmed yet, derived
 * from their legacy pay settings. The manager must confirm it before payroll
 * can be approved — this is only a prefill.
 *   Daily   → the rate itself
 *   Hourly  → rate × standard hours
 *   Monthly → rate × 12 ÷ 261 (the common PH factor for a 5-day week)
 */
export function suggestDailyRateCents(payType: string, payRateCents: number, standardDailyHours: number): number {
  if (payType === "Daily") return payRateCents;
  if (payType === "Hourly") return Math.round(payRateCents * standardDailyHours);
  return Math.round((payRateCents * 12) / 261);
}

/** Final payable: base + the approved adjustments (signed centavos). */
export function payableCents(baseCents: number, adjustments: { amountCents: number; approved: boolean }[]): number {
  return baseCents + adjustments.reduce((s, a) => (a.approved ? s + a.amountCents : s), 0);
}

/** "2.5" style hours for labels (1 decimal). */
export function hoursLabel(minutes: number): string {
  return String(Math.round((minutes / 60) * 10) / 10);
}
