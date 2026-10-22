import { describe, it, expect } from "vitest";
import { buildAttendanceDays, manilaDate, summarizeAttendance, type Punch } from "./attendance.js";

// 2026-10-05 is a Monday. Schedule: Mon–Sat, 8-hour day, 60-min unpaid break.
const schedule = { workDays: [1, 2, 3, 4, 5, 6], standardDailyHours: 8, unpaidBreakMinutes: 60 };
const NOW = new Date("2026-10-12T10:00:00+08:00"); // the following Monday, mid-morning

let seq = 0;
const punch = (inAt: string, outAt: string | null, needsReview = false): Punch => ({
  id: `p${++seq}`,
  clockIn: new Date(inAt).toISOString(),
  clockOut: outAt ? new Date(outAt).toISOString() : null,
  needsReview,
});

function day(date: string, punches: Punch[] = [], extra: Partial<Parameters<typeof buildAttendanceDays>[0]> = {}) {
  const [d] = buildAttendanceDays({
    from: date,
    to: date,
    now: NOW,
    schedule,
    hireDate: null,
    separatedOn: null,
    punches,
    manual: [],
    ...extra,
  });
  return d;
}

describe("manilaDate", () => {
  it("assigns an instant to its Manila calendar day", () => {
    expect(manilaDate("2026-10-05T17:30:00Z")).toBe("2026-10-06"); // 01:30 Manila next day
    expect(manilaDate("2026-10-05T15:59:00Z")).toBe("2026-10-05");
  });
});

describe("buildAttendanceDays — working hours", () => {
  it("full day: 9h on the clock − 60 min break = 8h worked → present", () => {
    const d = day("2026-10-05", [punch("2026-10-05T08:00:00+08:00", "2026-10-05T17:00:00+08:00")]);
    expect(d.status).toBe("present");
    expect(d.grossMinutes).toBe(540);
    expect(d.breakMinutes).toBe(60);
    expect(d.workedMinutes).toBe(480);
  });

  it("the brief's example: 7h on the clock − 60 min break = 6h worked → present (6 ≥ half of 8)", () => {
    const d = day("2026-10-05", [punch("2026-10-05T08:00:00+08:00", "2026-10-05T15:00:00+08:00")]);
    expect(d.workedMinutes).toBe(360);
    expect(d.status).toBe("present");
  });

  it("no break under 5 hours: 3h30 worked → half-day (under 4h)", () => {
    const d = day("2026-10-05", [punch("2026-10-05T08:00:00+08:00", "2026-10-05T11:30:00+08:00")]);
    expect(d.breakMinutes).toBe(0);
    expect(d.workedMinutes).toBe(210);
    expect(d.status).toBe("half_day");
  });

  it("split shift: punches add up and the break is taken once", () => {
    const d = day("2026-10-05", [
      punch("2026-10-05T13:00:00+08:00", "2026-10-05T17:00:00+08:00"),
      punch("2026-10-05T07:00:00+08:00", "2026-10-05T10:00:00+08:00"),
    ]);
    expect(d.grossMinutes).toBe(420);
    expect(d.workedMinutes).toBe(360);
    expect(d.punches[0].timeIn < d.punches[1].timeIn).toBe(true); // sorted for display
  });

  it("an overnight shift belongs to the day it started", () => {
    const days = buildAttendanceDays({
      from: "2026-10-05",
      to: "2026-10-06",
      now: NOW,
      schedule,
      hireDate: null,
      separatedOn: null,
      punches: [punch("2026-10-05T22:00:00+08:00", "2026-10-06T06:00:00+08:00")],
      manual: [],
    });
    expect(days[0].workedMinutes).toBe(420);
    expect(days[1].status).toBe("absent");
  });
});

describe("buildAttendanceDays — status from the schedule", () => {
  it("a scheduled day with no punch is absent", () => {
    expect(day("2026-10-06").status).toBe("absent");
  });

  it("Sunday (not scheduled) is a rest day", () => {
    expect(day("2026-10-11").status).toBe("rest_day");
  });

  it("working on a rest day counts and is flagged", () => {
    const d = day("2026-10-11", [punch("2026-10-11T09:00:00+08:00", "2026-10-11T18:00:00+08:00")]);
    expect(d.status).toBe("present");
    expect(d.restDayWorked).toBe(true);
  });

  it("today with no punch yet is pending, not absent", () => {
    expect(day("2026-10-12").status).toBe("pending");
  });

  it("today while still on the clock is present, counting minutes so far", () => {
    const d = day("2026-10-12", [punch("2026-10-12T08:00:00+08:00", null)]);
    expect(d.status).toBe("present");
    expect(d.punches[0].open).toBe(true);
    expect(d.workedMinutes).toBe(120);
  });

  it("future days and days before hire are unscheduled", () => {
    expect(day("2026-10-13").status).toBe("unscheduled");
    expect(day("2026-10-05", [], { hireDate: "2026-10-07" }).status).toBe("unscheduled");
    expect(day("2026-10-09", [], { separatedOn: "2026-10-08" }).status).toBe("unscheduled");
  });
});

describe("buildAttendanceDays — forgotten Shift Out", () => {
  it("a card still open from a past day counts 0 hours and needs review", () => {
    const d = day("2026-10-06", [punch("2026-10-06T08:00:00+08:00", null)]);
    expect(d.status).toBe("needs_review");
    expect(d.workedMinutes).toBe(0);
    expect(d.punches[0].needsReview).toBe(true);
  });

  it("a card the system auto-closed counts 0 hours and needs review", () => {
    const d = day("2026-10-06", [punch("2026-10-06T08:00:00+08:00", "2026-10-06T08:00:00+08:00", true)]);
    expect(d.status).toBe("needs_review");
    expect(d.workedMinutes).toBe(0);
  });
});

describe("buildAttendanceDays — manual entries win", () => {
  const manual = (status: "Present" | "Absent" | "Leave" | "Half-day", hours = 0) => [
    { date: "2026-10-06", status, hours, note: "set by manager" },
  ];

  it("Leave overrides an absent day and pays no worked minutes", () => {
    const d = day("2026-10-06", [], { manual: manual("Leave") });
    expect(d.status).toBe("leave");
    expect(d.manual).toBe(true);
    expect(d.workedMinutes).toBe(0);
  });

  it("a manual Present with no hours counts a standard day", () => {
    expect(day("2026-10-06", [], { manual: manual("Present") }).workedMinutes).toBe(480);
  });

  it("a manual Half-day uses the hours given, else half a day", () => {
    expect(day("2026-10-06", [], { manual: manual("Half-day", 3) }).workedMinutes).toBe(180);
    expect(day("2026-10-06", [], { manual: manual("Half-day") }).workedMinutes).toBe(240);
  });

  it("a manual entry also settles a needs-review day", () => {
    const d = day("2026-10-06", [punch("2026-10-06T08:00:00+08:00", null)], { manual: manual("Present", 8) });
    expect(d.status).toBe("present");
    expect(d.workedMinutes).toBe(480);
  });
});

describe("summarizeAttendance", () => {
  it("counts each status and totals worked minutes over a week", () => {
    const days = buildAttendanceDays({
      from: "2026-10-05",
      to: "2026-10-11",
      now: NOW,
      schedule,
      hireDate: null,
      separatedOn: null,
      punches: [
        punch("2026-10-05T08:00:00+08:00", "2026-10-05T17:00:00+08:00"), // Mon present 8h
        punch("2026-10-06T08:00:00+08:00", "2026-10-06T11:00:00+08:00"), // Tue half 3h
        punch("2026-10-08T08:00:00+08:00", null), // Thu forgot to clock out
      ],
      manual: [{ date: "2026-10-09", status: "Leave", hours: 0, note: null }], // Fri leave
    });
    const s = summarizeAttendance(days);
    expect(s).toMatchObject({
      scheduledDays: 6, // Mon–Sat
      presentDays: 1,
      halfDays: 1,
      absentDays: 2, // Wed + Sat
      leaveDays: 1,
      restDays: 1, // Sun
      needsReviewDays: 1,
      workedMinutes: 480 + 180,
    });
  });
});
