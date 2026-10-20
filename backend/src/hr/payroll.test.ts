import { describe, it, expect } from "vitest";
import type { AttendanceDay, DayStatus } from "./attendance.js";
import { computePayLine, payableCents, suggestDailyRateCents } from "./payroll.js";

const day = (status: DayStatus, workedMinutes: number): AttendanceDay => ({
  date: "2026-10-05",
  weekday: 1,
  scheduled: true,
  status,
  punches: [],
  grossMinutes: workedMinutes,
  breakMinutes: 0,
  workedMinutes,
  manual: false,
  note: null,
  restDayWorked: false,
});

describe("computePayLine — base earnings", () => {
  it("the brief's example: ₱600/day, 8h standard, 6h worked → ₱450", () => {
    const p = computePayLine({ days: [day("present", 360)], dailyRateCents: 60_000, standardDailyHours: 8 });
    expect(p.baseCents).toBe(45_000);
    expect(p.regularMinutes).toBe(360);
  });

  it("a full 8h day pays exactly the daily rate", () => {
    expect(computePayLine({ days: [day("present", 480)], dailyRateCents: 61_000, standardDailyHours: 8 }).baseCents).toBe(61_000);
  });

  it("caps each day at the standard day; the excess is overtime, not base", () => {
    const p = computePayLine({ days: [day("present", 600)], dailyRateCents: 60_000, standardDailyHours: 8 });
    expect(p.regularMinutes).toBe(480);
    expect(p.overtimeMinutes).toBe(120);
    expect(p.baseCents).toBe(60_000);
    // 2h × (₱600 ÷ 8 = ₱75/h) × 1.25 = ₱187.50
    expect(p.overtimeCents).toBe(18_750);
  });

  it("sums a period and counts each status", () => {
    const p = computePayLine({
      days: [day("present", 480), day("half_day", 180), day("absent", 0), day("leave", 0), day("needs_review", 0), day("rest_day", 0)],
      dailyRateCents: 60_000,
      standardDailyHours: 8,
    });
    expect(p).toMatchObject({ presentDays: 1, halfDays: 1, absentDays: 1, leaveDays: 1, needsReviewDays: 1 });
    expect(p.baseCents).toBe(60_000 + 22_500); // 8h + 3h
    expect(p.paidLeaveCents).toBe(60_000); // suggested, not in base
  });

  it("rounds once, at the centavo (no float drift across many days)", () => {
    const days = Array.from({ length: 26 }, () => day("present", 457)); // 7h37m each
    const p = computePayLine({ days, dailyRateCents: 64_500, standardDailyHours: 8 });
    expect(p.baseCents).toBe(Math.round((64_500 * 457 * 26) / 480));
  });

  it("respects a non-8-hour standard day", () => {
    // ₱500 / 6h day, 3h worked → ₱250
    expect(computePayLine({ days: [day("half_day", 180)], dailyRateCents: 50_000, standardDailyHours: 6 }).baseCents).toBe(25_000);
  });
});

describe("suggestDailyRateCents (prefill only — the manager must confirm)", () => {
  it("Daily keeps the rate, Hourly × standard hours, Monthly × 12 ÷ 261", () => {
    expect(suggestDailyRateCents("Daily", 60_000, 8)).toBe(60_000);
    expect(suggestDailyRateCents("Hourly", 7_500, 8)).toBe(60_000);
    expect(suggestDailyRateCents("Monthly", 1_305_000, 8)).toBe(60_000); // ₱13,050 × 12 ÷ 261 = ₱600
  });
});

describe("payableCents", () => {
  it("adds only APPROVED adjustments, including deductions", () => {
    const total = payableCents(45_000, [
      { amountCents: 18_750, approved: false }, // overtime not yet approved
      { amountCents: 5_000, approved: true }, // holiday pay
      { amountCents: -2_000, approved: true }, // cash advance
    ]);
    expect(total).toBe(48_000);
  });
});
