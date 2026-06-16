import { z } from "zod";

/**
 * Validation + API shapes for labor time-tracking (the shift clock / timecards).
 *
 * Clock-in / clock-out carry NO scoping in the body — the tenant and user are
 * read from the verified session, never the request — so the only optional input
 * is a short free-text note for audit colour. Durations are reported in whole
 * minutes; money (the payroll log) is integer centavos, matching the rest of the
 * money discipline.
 */

export const TIMECARD_STATUSES = ["ACTIVE", "COMPLETED"] as const;
export type TimecardStatus = (typeof TIMECARD_STATUSES)[number];

/** Optional note accepted on a clock punch (e.g. "covering for Ana"). */
export const clockSchema = z.object({
  note: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(240).optional(),
  ),
});

export type ClockInput = z.infer<typeof clockSchema>;

/** A single clock record. `durationMinutes` is fixed for a completed card and
 *  the live elapsed time for an active one (computed at read time). */
export interface Timecard {
  id: string;
  userId: string;
  clockIn: string; // ISO
  clockOut: string | null;
  status: TimecardStatus;
  durationMinutes: number;
}

/** The caller's clock state, for the POS widget. */
export interface ClockStatus {
  /** The caller's currently-open timecard, or null when off the clock. */
  timecard: Timecard | null;
  /** Total minutes worked today (Manila), including any running punch. */
  todayMinutes: number;
}

/** The caller's own history + rolling totals, for the self-service summary. */
export interface MyTimecards {
  timecards: Timecard[];
  weekMinutes: number;
  monthMinutes: number;
}

// ── Labor analytics (owner / manager) ──────────────────────────────────────

/** A worker currently on the clock, with their running duration. */
export interface ActiveStaffMember {
  userId: string;
  name: string;
  clockIn: string;
  elapsedMinutes: number;
}

/** One cashier's labor-vs-output efficiency over the analytics window. */
export interface CashierEfficiencyRow {
  userId: string;
  name: string;
  laborMinutes: number;
  laborHours: number;
  orders: number;
  revenueCents: number;
  /** Gross sales generated per worked hour. */
  revenuePerHourCents: number;
  /** Average basket (revenue ÷ orders). */
  avgOrderCents: number;
  /** Clocked labor minutes ÷ orders — a throughput proxy (lower = brisker). */
  minutesPerOrder: number;
  /** laborHours × the baseline hourly rate — the payroll-log line. */
  payCents: number;
}

export interface LaborAnalytics {
  from: string;
  to: string;
  /** The baseline hourly compensation rate used for the labor cost + payroll log. */
  hourlyRateCents: number;
  laborMinutes: number;
  laborHours: number;
  grossSalesCents: number;
  laborCostCents: number;
  /** Labor cost as a share of gross sales (0 when there were no sales). */
  laborCostPct: number;
  /** Gross sales generated per worked labor hour. */
  salesPerLaborHourCents: number;
  activeStaff: ActiveStaffMember[];
  cashiers: CashierEfficiencyRow[];
}
