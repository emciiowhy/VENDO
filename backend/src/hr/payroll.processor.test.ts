import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  hourlyRateCentsFor,
  processPayroll,
  splitPunch,
  toPayrollCsv,
  type PayrollEmployee,
  type PayrollTimecard,
} from "./payroll.processor.js";

const app = createApp();

// ₱100/hr baseline used across the wage cases.
const RATE = 10_000;

function hourly(id: string, userId: string | null, rateCents = RATE): PayrollEmployee {
  return { id, name: `Emp ${id}`, position: null, payType: "Hourly", payRateCents: rateCents, userId };
}

function punch(userId: string, clockIn: string, clockOut: string): PayrollTimecard {
  return { userId, clockIn, clockOut };
}

describe("payroll export routes require store-management auth", () => {
  it("blocks the CSV export for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/payroll/export")).status).toBe(401);
  });
  it("blocks the export preview for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/payroll/export/preview")).status).toBe(401);
  });
  it("blocks the shift reconciliation matrix for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/shift-reconciliations")).status).toBe(401);
  });
});

describe("hourlyRateCentsFor", () => {
  it("uses the hourly rate verbatim", () => {
    expect(hourlyRateCentsFor("Hourly", 10_000)).toBe(10_000);
  });
  it("spreads a daily rate across an 8h day", () => {
    expect(hourlyRateCentsFor("Daily", 80_000)).toBe(10_000);
  });
  it("spreads a monthly rate across a 176h standard month", () => {
    expect(hourlyRateCentsFor("Monthly", 1_760_000)).toBe(10_000);
  });
});

describe("splitPunch", () => {
  it("counts a plain daytime shift as worked hours with no night overlap", () => {
    // 09:00–15:00 Manila = 01:00Z–07:00Z, a single Manila day.
    const s = splitPunch("2026-06-16T01:00:00Z", "2026-06-16T07:00:00Z");
    const total = [...s.dayMs.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(6 * 3_600_000);
    expect(s.nightMs).toBe(0);
    expect(s.dayMs.size).toBe(1);
  });
  it("splits an overnight shift across two Manila days and counts night hours", () => {
    // 22:00 (06-16) → 06:00 (06-17) Manila = 14:00Z–22:00Z, fully inside the night window.
    const s = splitPunch("2026-06-16T14:00:00Z", "2026-06-16T22:00:00Z");
    expect(s.dayMs.size).toBe(2);
    expect(s.nightMs).toBe(8 * 3_600_000);
  });
  it("ignores a zero or inverted interval", () => {
    const s = splitPunch("2026-06-16T07:00:00Z", "2026-06-16T01:00:00Z");
    expect(s.dayMs.size).toBe(0);
    expect(s.nightMs).toBe(0);
  });
});

describe("processPayroll", () => {
  const opts = { includeNightDifferential: true };

  it("prices a 6-hour regular shift at the flat hourly rate", () => {
    const r = processPayroll([hourly("a", "u1")], [punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T07:00:00Z")], "2026-06-16", "2026-06-16", opts);
    const l = r.lines[0];
    expect(l.regularHours).toBe(6);
    expect(l.overtimeHours).toBe(0);
    expect(l.nightDiffHours).toBe(0);
    expect(l.grossCents).toBe(60_000);
    expect(l.daysWorked).toBe(1);
  });

  it("splits hours past 8 on a day into overtime at 1.25×", () => {
    // 09:00–19:00 Manila (10h) = 01:00Z–11:00Z.
    const r = processPayroll([hourly("a", "u1")], [punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T11:00:00Z")], "2026-06-16", "2026-06-16", opts);
    const l = r.lines[0];
    expect(l.regularHours).toBe(8);
    expect(l.overtimeHours).toBe(2);
    // 8×100 + 2×100×1.25 = 800 + 250 = ₱1,050.
    expect(l.grossCents).toBe(105_000);
  });

  it("adds a 10% night differential for the night window when enabled", () => {
    const r = processPayroll([hourly("a", "u1")], [punch("u1", "2026-06-16T14:00:00Z", "2026-06-16T22:00:00Z")], "2026-06-16", "2026-06-17", opts);
    const l = r.lines[0];
    expect(l.nightDiffHours).toBe(8);
    expect(l.overtimeHours).toBe(0); // 2h + 6h across two days, never past the 8h cap
    // 8×100 base + 8×100×0.10 night = 800 + 80 = ₱880.
    expect(l.grossCents).toBe(88_000);
    expect(l.nightDiffPayCents).toBe(8_000);
  });

  it("reports night hours but pays no premium when the toggle is off", () => {
    const r = processPayroll([hourly("a", "u1")], [punch("u1", "2026-06-16T14:00:00Z", "2026-06-16T22:00:00Z")], "2026-06-16", "2026-06-17", { includeNightDifferential: false });
    const l = r.lines[0];
    expect(l.nightDiffHours).toBe(8);
    expect(l.nightDiffPayCents).toBe(0);
    expect(l.grossCents).toBe(80_000);
  });

  it("applies the 8h overtime cap to combined punches on the same day", () => {
    const r = processPayroll(
      [hourly("a", "u1")],
      [
        punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T06:00:00Z"), // 5h
        punch("u1", "2026-06-16T06:00:00Z", "2026-06-16T11:00:00Z"), // 5h
      ],
      "2026-06-16",
      "2026-06-16",
      opts,
    );
    const l = r.lines[0];
    expect(l.regularHours).toBe(8);
    expect(l.overtimeHours).toBe(2);
    expect(l.daysWorked).toBe(1);
  });

  it("gives an unlinked employee a zero line", () => {
    const r = processPayroll([hourly("a", null)], [punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T07:00:00Z")], "2026-06-16", "2026-06-16", opts);
    expect(r.lines[0].grossCents).toBe(0);
    expect(r.lines[0].totalHours).toBe(0);
  });

  it("rolls per-line figures into the totals", () => {
    const r = processPayroll(
      [hourly("a", "u1"), hourly("b", "u2")],
      [
        punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T07:00:00Z"), // 6h reg
        punch("u2", "2026-06-16T01:00:00Z", "2026-06-16T11:00:00Z"), // 8h + 2h OT
      ],
      "2026-06-16",
      "2026-06-16",
      opts,
    );
    expect(r.totals.headcount).toBe(2);
    expect(r.totals.regularHours).toBe(14);
    expect(r.totals.overtimeHours).toBe(2);
    expect(r.totals.grossCents).toBe(60_000 + 105_000);
  });
});

describe("toPayrollCsv", () => {
  it("emits a header, a row per employee, and a TOTALS line", () => {
    const r = processPayroll([hourly("a", "u1")], [punch("u1", "2026-06-16T01:00:00Z", "2026-06-16T07:00:00Z")], "2026-06-16", "2026-06-16", { includeNightDifferential: true });
    const csv = toPayrollCsv(r);
    const rows = csv.trimEnd().split("\r\n");
    expect(rows[0]).toContain("Gross Earnings");
    expect(rows).toHaveLength(3); // header + 1 employee + totals
    expect(rows[2]).toContain("TOTALS");
    expect(rows[1]).toContain("600.00"); // ₱600 gross as plain decimal
  });

  it("escapes commas in names per RFC 4180", () => {
    const emp: PayrollEmployee = { id: "a", name: "Santos, Maria", position: null, payType: "Hourly", payRateCents: RATE, userId: "u1" };
    const r = processPayroll([emp], [], "2026-06-16", "2026-06-16", { includeNightDifferential: true });
    expect(toPayrollCsv(r)).toContain('"Santos, Maria"');
  });
});
