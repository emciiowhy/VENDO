import { manilaDate } from "../hr/attendance.js";

/**
 * Cashier attendance — hours worked, straight from the Shift In / Shift Out
 * labor clock (`timecards`). Pure so the day/total maths is unit-testable
 * without a database or a clock.
 *
 * There is no payroll and no work schedule here: the owner reads the hours and
 * works out pay themselves. A punch belongs to the Manila day it STARTED on. A
 * punch still needing review (a forgotten Shift Out that was auto-closed at zero
 * length, or one left open from a day that has already ended) contributes no
 * hours until the owner enters the real Time Out.
 */

export interface CashierPunch {
  id: string;
  clockIn: string;
  clockOut: string | null;
  /** Whole minutes; an open punch from today measures against `now`. */
  minutes: number;
  /** Still on the clock right now (open punch from today). */
  open: boolean;
  needsReview: boolean;
}

export interface CashierDay {
  date: string;
  workedMinutes: number;
  needsReview: boolean;
  punches: CashierPunch[];
}

export interface CashierAttendanceTotals {
  daysWorked: number;
  workedMinutes: number;
  punches: number;
  needsReview: number;
}

export interface RawPunch {
  id: string;
  clockIn: Date;
  clockOut: Date | null;
  needsReview: boolean;
}

/** Classify one raw timecard: its minutes, whether it's open, whether it needs review. */
export function toPunch(raw: RawPunch, now: Date = new Date()): CashierPunch {
  const staleOpen = raw.clockOut === null && manilaDate(raw.clockIn) < manilaDate(now);
  const needsReview = raw.needsReview || staleOpen;
  const end = raw.clockOut ?? now;
  const minutes = needsReview ? 0 : Math.max(0, Math.round((end.getTime() - raw.clockIn.getTime()) / 60_000));
  return {
    id: raw.id,
    clockIn: raw.clockIn.toISOString(),
    clockOut: raw.clockOut ? raw.clockOut.toISOString() : null,
    minutes,
    open: raw.clockOut === null && !staleOpen,
    needsReview,
  };
}

/** Group punches by the Manila day they started on, oldest day first. */
export function groupByDay(punches: CashierPunch[]): CashierDay[] {
  const byDate = new Map<string, CashierDay>();
  for (const p of punches) {
    const date = manilaDate(p.clockIn);
    const day = byDate.get(date) ?? { date, workedMinutes: 0, needsReview: false, punches: [] };
    day.workedMinutes += p.minutes;
    day.needsReview ||= p.needsReview;
    day.punches.push(p);
    byDate.set(date, day);
  }
  for (const day of byDate.values()) day.punches.sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Roll days into the totals. A day counts as worked once it has any hours. */
export function totalsOf(days: CashierDay[]): CashierAttendanceTotals {
  return {
    daysWorked: days.filter((d) => d.workedMinutes > 0).length,
    workedMinutes: days.reduce((n, d) => n + d.workedMinutes, 0),
    punches: days.reduce((n, d) => n + d.punches.length, 0),
    needsReview: days.reduce((n, d) => n + d.punches.filter((p) => p.needsReview).length, 0),
  };
}
