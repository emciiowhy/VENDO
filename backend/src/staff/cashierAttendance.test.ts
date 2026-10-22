import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { groupByDay, toPunch, totalsOf } from "./cashierAttendance.js";

// 2026-10-20 14:00 Manila = 06:00Z.
const NOW = new Date("2026-10-20T06:00:00Z");
const at = (iso: string) => new Date(iso);

describe("toPunch", () => {
  it("measures a completed punch in whole minutes", () => {
    const p = toPunch({ id: "a", clockIn: at("2026-10-19T00:00:00Z"), clockOut: at("2026-10-19T08:30:00Z"), needsReview: false }, NOW);
    expect(p).toMatchObject({ minutes: 510, open: false, needsReview: false });
  });

  it("measures today's open punch against now and marks it open", () => {
    const p = toPunch({ id: "a", clockIn: at("2026-10-20T01:00:00Z"), clockOut: null, needsReview: false }, NOW);
    expect(p).toMatchObject({ minutes: 300, open: true, needsReview: false });
  });

  it("flags a punch left open from an earlier day and counts no hours for it", () => {
    const p = toPunch({ id: "a", clockIn: at("2026-10-18T01:00:00Z"), clockOut: null, needsReview: false }, NOW);
    expect(p).toMatchObject({ minutes: 0, open: false, needsReview: true });
  });

  it("counts no hours for an auto-closed punch awaiting review", () => {
    const p = toPunch({ id: "a", clockIn: at("2026-10-18T01:00:00Z"), clockOut: at("2026-10-18T01:00:00Z"), needsReview: true }, NOW);
    expect(p).toMatchObject({ minutes: 0, needsReview: true });
  });
});

describe("groupByDay + totalsOf", () => {
  it("attributes punches to the Manila day they started and sums them", () => {
    const punches = [
      // 2026-10-19 22:00 Manila → 2026-10-20 02:00 Manila: belongs to the 19th.
      { id: "late", clockIn: at("2026-10-19T14:00:00Z"), clockOut: at("2026-10-19T18:00:00Z"), needsReview: false },
      { id: "am", clockIn: at("2026-10-18T00:00:00Z"), clockOut: at("2026-10-18T04:00:00Z"), needsReview: false },
      { id: "pm", clockIn: at("2026-10-18T05:00:00Z"), clockOut: at("2026-10-18T09:00:00Z"), needsReview: false },
      { id: "stale", clockIn: at("2026-10-17T01:00:00Z"), clockOut: null, needsReview: false },
    ].map((r) => toPunch(r, NOW));
    const days = groupByDay(punches);
    expect(days.map((d) => [d.date, d.workedMinutes, d.punches.length, d.needsReview])).toEqual([
      ["2026-10-17", 0, 1, true],
      ["2026-10-18", 480, 2, false],
      ["2026-10-19", 240, 1, false],
    ]);
    expect(totalsOf(days)).toEqual({ daysWorked: 2, workedMinutes: 720, punches: 4, needsReview: 1 });
  });
});

describe("Cashier attendance routes are owner-fenced", () => {
  const app = createApp();
  it("blocks the store attendance for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/staff/attendance?month=2026-10")).status).toBe(401);
  });
  it("blocks one cashier's attendance for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/staff/cashiers/00000000-0000-0000-0000-000000000000/attendance");
    expect(res.status).toBe(401);
  });
  it("blocks a timecard correction for the unauthenticated with 401", async () => {
    const res = await request(app)
      .patch("/api/v1/staff/timecards/00000000-0000-0000-0000-000000000000")
      .send({ clockOut: "2026-10-19T10:00:00+08:00" });
    expect(res.status).toBe(401);
  });
});
