/**
 * Attendance — the pure rules that turn Shift In / Shift Out punches into one
 * status per day. No database access, so every rule is unit-tested directly
 * (attendance.test.ts) and the employee page, the calendar and payroll all read
 * the same answer.
 *
 * Inputs: the employee's weekly schedule, their timecards (Shift In = clock_in,
 * Shift Out = clock_out) and any manual entries a manager made. Rules, per
 * Manila calendar day (a shift belongs to the day it STARTED on):
 *
 *   1. A manual entry (Leave / Absent / Half-day / Present) always wins — the
 *      manager's explicit call beats anything derived.
 *   2. Before the hire date, after separation, or in the future → unscheduled.
 *   3. Worked minutes = punch minutes − the unpaid break, which is taken once
 *      when the day's punches total ≥ 5 hours.
 *   4. A forgotten Shift Out (a card still open from a past day, or one the
 *      system auto-closed) counts 0 minutes and marks the day needs_review —
 *      the system never guesses hours someone might not have worked.
 *   5. Otherwise: not a scheduled weekday → rest day (or "worked on rest day"
 *      if they punched); scheduled with no punch → absent (pending if today);
 *      worked under half the standard day → half-day; else present.
 */

export type DayStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "rest_day"
  | "unscheduled"
  | "pending"
  | "needs_review";

export interface Schedule {
  /** Scheduled weekdays, 0 = Sunday … 6 = Saturday. */
  workDays: number[];
  standardDailyHours: number;
  unpaidBreakMinutes: number;
}

export interface Punch {
  id: string;
  /** ISO instants. */
  clockIn: string;
  clockOut: string | null;
  needsReview: boolean;
}

export interface ManualEntry {
  date: string; // YYYY-MM-DD
  status: "Present" | "Absent" | "Leave" | "Half-day";
  hours: number;
  note: string | null;
}

export interface PunchView {
  id: string;
  timeIn: string;
  timeOut: string | null;
  /** Minutes this punch contributes (0 when it needs review). */
  minutes: number;
  /** Still on the clock right now. */
  open: boolean;
  needsReview: boolean;
}

export interface AttendanceDay {
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  scheduled: boolean;
  status: DayStatus;
  punches: PunchView[];
  grossMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  /** True when a manager's manual entry decided this day. */
  manual: boolean;
  note: string | null;
  restDayWorked: boolean;
}

export interface AttendanceSummary {
  scheduledDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  restDays: number;
  needsReviewDays: number;
  workedMinutes: number;
}

/** A day's punches must total at least this before the unpaid break applies. */
export const BREAK_THRESHOLD_MINUTES = 5 * 60;

const MNL_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8, no DST.

/** The Manila calendar date (YYYY-MM-DD) of an instant. */
export function manilaDate(instant: Date | string): string {
  const t = typeof instant === "string" ? Date.parse(instant) : instant.getTime();
  return new Date(t + MNL_OFFSET_MS).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function buildAttendanceDays(input: {
  from: string;
  to: string;
  now: Date;
  schedule: Schedule;
  hireDate: string | null;
  separatedOn: string | null;
  punches: Punch[];
  manual: ManualEntry[];
}): AttendanceDay[] {
  const { schedule, now } = input;
  const today = manilaDate(now);
  const stdMinutes = Math.round(schedule.standardDailyHours * 60);
  const workDays = new Set(schedule.workDays);
  const manualByDate = new Map(input.manual.map((m) => [m.date, m]));

  // Group punches by the Manila day they started on.
  const punchesByDate = new Map<string, PunchView[]>();
  for (const p of input.punches) {
    const date = manilaDate(p.clockIn);
    const forgotten = p.clockOut === null && date < today;
    const open = p.clockOut === null && !forgotten;
    const needsReview = p.needsReview || forgotten;
    const end = p.clockOut ? Date.parse(p.clockOut) : now.getTime();
    const minutes = needsReview ? 0 : Math.max(0, Math.floor((end - Date.parse(p.clockIn)) / 60_000));
    const list = punchesByDate.get(date) ?? [];
    list.push({ id: p.id, timeIn: p.clockIn, timeOut: p.clockOut, minutes, open, needsReview });
    punchesByDate.set(date, list);
  }

  const days: AttendanceDay[] = [];
  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    const punches = (punchesByDate.get(date) ?? []).sort((a, b) => a.timeIn.localeCompare(b.timeIn));
    const grossMinutes = punches.reduce((s, p) => s + p.minutes, 0);
    const breakMinutes = grossMinutes >= BREAK_THRESHOLD_MINUTES ? Math.min(schedule.unpaidBreakMinutes, grossMinutes) : 0;
    const punchedMinutes = grossMinutes - breakMinutes;
    const employed =
      (!input.hireDate || date >= input.hireDate) && (!input.separatedOn || date <= input.separatedOn);
    const scheduled = employed && workDays.has(weekday) && date <= today;
    const base = { date, weekday, scheduled, punches, grossMinutes, breakMinutes, restDayWorked: false };

    // 1. A manager's manual entry wins.
    const m = manualByDate.get(date);
    if (m) {
      const hoursMin = Math.round(m.hours * 60);
      const status: DayStatus =
        m.status === "Leave" ? "leave" : m.status === "Absent" ? "absent" : m.status === "Half-day" ? "half_day" : "present";
      const workedMinutes =
        status === "leave" || status === "absent"
          ? 0
          : hoursMin > 0
            ? hoursMin
            : punchedMinutes > 0
              ? punchedMinutes
              : status === "half_day"
                ? Math.round(stdMinutes / 2)
                : stdMinutes;
      days.push({ ...base, status, workedMinutes, manual: true, note: m.note });
      continue;
    }

    const withHours = (status: DayStatus, extra: Partial<AttendanceDay> = {}): AttendanceDay => ({
      ...base,
      status,
      workedMinutes: punchedMinutes,
      manual: false,
      note: null,
      ...extra,
    });

    // 2. Outside employment, or a day that hasn't happened yet.
    if (!employed || date > today) {
      days.push(withHours("unscheduled", { workedMinutes: 0 }));
      continue;
    }
    // 4. A forgotten Shift Out needs a manager before it counts.
    if (punches.some((p) => p.needsReview)) {
      days.push(withHours("needs_review"));
      continue;
    }
    // 5. Derived from the schedule and the punches.
    const onTheClock = punches.some((p) => p.open);
    const judged = (): DayStatus =>
      onTheClock ? "present" : punchedMinutes < stdMinutes / 2 ? "half_day" : "present";
    if (!workDays.has(weekday)) {
      days.push(punches.length > 0 ? withHours(judged(), { restDayWorked: true }) : withHours("rest_day"));
      continue;
    }
    if (punches.length === 0) {
      days.push(withHours(date === today ? "pending" : "absent", { workedMinutes: 0 }));
      continue;
    }
    days.push(withHours(judged()));
  }
  return days;
}

/** Roll a run of days into the counts the employee page and payroll show. */
export function summarizeAttendance(days: AttendanceDay[]): AttendanceSummary {
  const s: AttendanceSummary = {
    scheduledDays: 0,
    presentDays: 0,
    halfDays: 0,
    absentDays: 0,
    leaveDays: 0,
    restDays: 0,
    needsReviewDays: 0,
    workedMinutes: 0,
  };
  for (const d of days) {
    if (d.scheduled) s.scheduledDays += 1;
    if (d.status === "present") s.presentDays += 1;
    else if (d.status === "half_day") s.halfDays += 1;
    else if (d.status === "absent") s.absentDays += 1;
    else if (d.status === "leave") s.leaveDays += 1;
    else if (d.status === "rest_day") s.restDays += 1;
    else if (d.status === "needs_review") s.needsReviewDays += 1;
    s.workedMinutes += d.workedMinutes;
  }
  return s;
}
