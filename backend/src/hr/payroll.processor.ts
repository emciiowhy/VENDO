/**
 * The Automated Payroll Exporter's calculation engine — a PURE, dependency-free
 * processor that turns labor-clock punches (timecards) into accounting-ready
 * payroll lines. Kept free of any DB/IO so the wage maths is unit-testable in
 * isolation; the repository (payroll.export.repository.ts) feeds it rows and the
 * route serialises the result to CSV.
 *
 * Hours are split on Philippine labour norms, evaluated in Manila wall-clock
 * (UTC+8, no DST — so a fixed +8h shift is exact and deterministic):
 *   • Regular hours    — up to 8 worked hours on a given Manila day.
 *   • Overtime hours   — worked hours beyond 8 on a day, paid at +25%.
 *   • Night-diff hours — worked time inside 22:00–06:00, paid a +10% premium on
 *                        top of the regular/OT rate (a standard PH differential).
 *
 * Money is integer centavos end-to-end. Every peso figure is derived with a
 * single Math.round at the centavo, never accumulated in floats, so the export
 * can't drift a centavo across thousands of punches.
 */

const MNL_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila = UTC+8, no DST.
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Standard PH working day; hours past it on a single day are overtime. */
export const STD_DAY_HOURS = 8;
/** A standard salaried month for hourly-equivalent conversion (22 days × 8h). */
export const STD_MONTH_HOURS = 176;
/** Overtime premium multiplier (PH: ordinary-day OT = 125% of the hourly rate). */
export const OT_MULTIPLIER = 1.25;
/** Night-shift differential (PH: +10% for hours worked 22:00–06:00). */
export const NIGHT_DIFF_RATE = 0.1;
/** Night window, Manila local hours: [22:00, 06:00). */
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 6;

/** A completed labor-clock punch fed into the processor (ISO instants). */
export interface PayrollTimecard {
  userId: string;
  clockIn: string;
  clockOut: string;
}

/** An employee profile the processor prices labour against. */
export interface PayrollEmployee {
  id: string;
  name: string;
  position: string | null;
  payType: string; // "Monthly" | "Daily" | "Hourly"
  payRateCents: number;
  /** The cashier/login id that the timecards are keyed by (null = unlinked). */
  userId: string | null;
}

export interface PayrollProcessorOptions {
  /** When false the night-differential premium is reported as 0 (toggle off). */
  includeNightDifferential: boolean;
}

/** One employee's priced payroll line for the period. */
export interface PayrollLine {
  employeeId: string;
  name: string;
  position: string | null;
  payType: string;
  /** The base hourly rate used for the maths (centavos), derived from pay type. */
  hourlyRateCents: number;
  daysWorked: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  totalHours: number;
  regularPayCents: number;
  overtimePayCents: number;
  nightDiffPayCents: number;
  grossCents: number;
}

export interface PayrollReport {
  from: string;
  to: string;
  includeNightDifferential: boolean;
  lines: PayrollLine[];
  totals: {
    headcount: number;
    regularHours: number;
    overtimeHours: number;
    nightDiffHours: number;
    grossCents: number;
  };
}

/** Overlap (ms) of two half-open instant ranges; never negative. */
function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** UTC instant of Manila-00:00 for the Manila calendar day containing `t`. */
function manilaDayStartUtc(t: number): number {
  const mnl = new Date(t + MNL_OFFSET_MS);
  const midnightAsUtcFields = Date.UTC(mnl.getUTCFullYear(), mnl.getUTCMonth(), mnl.getUTCDate());
  return midnightAsUtcFields - MNL_OFFSET_MS;
}

/** Round hours to 2 dp for display (pay is always derived from raw ms, not this). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface PunchSplit {
  /** Worked ms keyed by the UTC instant of each spanned Manila day's midnight. */
  dayMs: Map<number, number>;
  /** Worked ms falling inside the 22:00–06:00 night window. */
  nightMs: number;
}

/**
 * Split one punch into per-Manila-day worked time plus its night-window overlap.
 * Walks day windows from the day before clock-in (to catch a night that began
 * the prior evening) through clock-out. Pure and exported for unit testing.
 */
export function splitPunch(clockInIso: string, clockOutIso: string): PunchSplit {
  const start = Date.parse(clockInIso);
  const end = Date.parse(clockOutIso);
  const dayMs = new Map<number, number>();
  let nightMs = 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { dayMs, nightMs };
  }
  // Begin one Manila day early so the previous evening's 22:00→ window is covered.
  for (let ds = manilaDayStartUtc(start) - DAY_MS; ds < end; ds += DAY_MS) {
    const worked = overlapMs(start, end, ds, ds + DAY_MS);
    if (worked > 0) dayMs.set(ds, (dayMs.get(ds) ?? 0) + worked);
    // The night window that OPENS on this day: [22:00 today, 06:00 tomorrow).
    nightMs += overlapMs(start, end, ds + NIGHT_START_HOUR * HOUR_MS, ds + (24 + NIGHT_END_HOUR) * HOUR_MS);
  }
  return { dayMs, nightMs };
}

/** The base hourly rate (centavos) for an employee, derived from their pay type. */
export function hourlyRateCentsFor(payType: string, payRateCents: number): number {
  if (payType === "Hourly") return payRateCents;
  if (payType === "Daily") return Math.round(payRateCents / STD_DAY_HOURS);
  // Monthly (and any unknown type) → spread across a standard salaried month.
  return Math.round(payRateCents / STD_MONTH_HOURS);
}

/**
 * Price a period's labour. Groups punches by the employee's linked login, sums
 * per-day worked time (so the 8h OT cap is applied per Manila day across multiple
 * punches), and derives regular/OT/night-diff hours and gross pay. Every active
 * employee gets a line, including those with no punches (zero hours), so the
 * export is a complete roster snapshot.
 */
export function processPayroll(
  employees: PayrollEmployee[],
  timecards: PayrollTimecard[],
  from: string,
  to: string,
  options: PayrollProcessorOptions,
): PayrollReport {
  // Bucket punches by the login they belong to.
  const punchesByUser = new Map<string, PayrollTimecard[]>();
  for (const tc of timecards) {
    if (!tc.userId) continue;
    const list = punchesByUser.get(tc.userId);
    if (list) list.push(tc);
    else punchesByUser.set(tc.userId, [tc]);
  }

  const lines: PayrollLine[] = employees.map((e) => {
    const hourlyRateCents = hourlyRateCentsFor(e.payType, e.payRateCents);
    const dayMs = new Map<number, number>();
    let nightMs = 0;
    for (const tc of e.userId ? (punchesByUser.get(e.userId) ?? []) : []) {
      const split = splitPunch(tc.clockIn, tc.clockOut);
      for (const [ds, ms] of split.dayMs) dayMs.set(ds, (dayMs.get(ds) ?? 0) + ms);
      nightMs += split.nightMs;
    }

    // Apply the 8-hour OT cap per Manila day, then total.
    let regularMs = 0;
    let overtimeMs = 0;
    let daysWorked = 0;
    const stdDayMs = STD_DAY_HOURS * HOUR_MS;
    for (const ms of dayMs.values()) {
      if (ms <= 0) continue;
      daysWorked += 1;
      regularMs += Math.min(ms, stdDayMs);
      overtimeMs += Math.max(ms - stdDayMs, 0);
    }

    const regularHours = regularMs / HOUR_MS;
    const overtimeHours = overtimeMs / HOUR_MS;
    const nightDiffHours = nightMs / HOUR_MS;

    const regularPayCents = Math.round(regularHours * hourlyRateCents);
    const overtimePayCents = Math.round(overtimeHours * hourlyRateCents * OT_MULTIPLIER);
    const nightDiffPayCents = options.includeNightDifferential
      ? Math.round(nightDiffHours * hourlyRateCents * NIGHT_DIFF_RATE)
      : 0;
    const grossCents = regularPayCents + overtimePayCents + nightDiffPayCents;

    return {
      employeeId: e.id,
      name: e.name,
      position: e.position,
      payType: e.payType,
      hourlyRateCents,
      daysWorked,
      regularHours: round2(regularHours),
      overtimeHours: round2(overtimeHours),
      nightDiffHours: round2(nightDiffHours),
      totalHours: round2(regularHours + overtimeHours),
      regularPayCents,
      overtimePayCents,
      nightDiffPayCents,
      grossCents,
    };
  });

  const totals = lines.reduce(
    (acc, l) => {
      acc.regularHours += l.regularHours;
      acc.overtimeHours += l.overtimeHours;
      acc.nightDiffHours += l.nightDiffHours;
      acc.grossCents += l.grossCents;
      return acc;
    },
    { headcount: lines.length, regularHours: 0, overtimeHours: 0, nightDiffHours: 0, grossCents: 0 },
  );
  totals.regularHours = round2(totals.regularHours);
  totals.overtimeHours = round2(totals.overtimeHours);
  totals.nightDiffHours = round2(totals.nightDiffHours);

  return { from, to, includeNightDifferential: options.includeNightDifferential, lines, totals };
}

// ── CSV serialisation ─────────────────────────────────────────────────────────

/** 15450 → "154.50" — plain decimal pesos for spreadsheet math (no ₱ symbol). */
function pesoDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Escape a CSV field per RFC 4180 (quote when it holds a comma/quote/newline). */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  "Employee",
  "Position",
  "Pay Type",
  "Hourly Rate",
  "Days Worked",
  "Regular Hours",
  "Overtime Hours",
  "Night Diff Hours",
  "Regular Pay",
  "Overtime Pay",
  "Night Diff Pay",
  "Gross Earnings",
];

/**
 * Serialise a payroll report to an accounting-ready CSV matrix: one row per
 * employee, alphabetical, with a trailing TOTALS row. Money is plain decimal
 * pesos so the file drops straight into a payroll spreadsheet.
 */
export function toPayrollCsv(report: PayrollReport): string {
  const lines: string[] = [];
  lines.push(CSV_HEADER.map(csvField).join(","));

  for (const l of report.lines) {
    lines.push(
      [
        l.name,
        l.position ?? "",
        l.payType,
        pesoDecimal(l.hourlyRateCents),
        l.daysWorked,
        l.regularHours.toFixed(2),
        l.overtimeHours.toFixed(2),
        l.nightDiffHours.toFixed(2),
        pesoDecimal(l.regularPayCents),
        pesoDecimal(l.overtimePayCents),
        pesoDecimal(l.nightDiffPayCents),
        pesoDecimal(l.grossCents),
      ]
        .map(csvField)
        .join(","),
    );
  }

  const t = report.totals;
  lines.push(
    [
      "TOTALS",
      `${t.headcount} employees`,
      "",
      "",
      "",
      t.regularHours.toFixed(2),
      t.overtimeHours.toFixed(2),
      t.nightDiffHours.toFixed(2),
      "",
      "",
      "",
      pesoDecimal(t.grossCents),
    ]
      .map(csvField)
      .join(","),
  );

  return lines.join("\r\n") + "\r\n";
}
