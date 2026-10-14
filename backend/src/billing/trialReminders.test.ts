import { describe, it, expect } from "vitest";
import {
  computeDueTrialReminders,
  markSent,
  daysUntil,
  TRIAL_REMINDER_DAYS,
} from "./trialReminders.js";

// The decision core is pure: it takes an injected `now`, the trial end, and the
// already-sent bitmask, and says which of the 7/3/1-day milestones are newly due.
// No database, no real clock — every case is a table row.

const NOW = new Date("2026-06-01T00:00:00.000Z");
/** A trial end `days` out from NOW. */
const endsIn = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

describe("computeDueTrialReminders", () => {
  it("fires nothing when the window is wider than every milestone", () => {
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(10), sentMask: 0, now: NOW })).toEqual([]);
  });

  it("fires only the 7-day nudge just inside the 7-day mark", () => {
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(6.5), sentMask: 0, now: NOW })).toEqual([
      7,
    ]);
  });

  it("fires 7 and 3 once inside the 3-day mark", () => {
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(2.5), sentMask: 0, now: NOW })).toEqual([
      7, 3,
    ]);
  });

  it("fires every still-applicable milestone for a short window first seen late", () => {
    // A trial first evaluated with half a day left owes 7, 3 AND 1 at once — the
    // nudges that are now past-due — but never skips to firing none.
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(0.5), sentMask: 0, now: NOW })).toEqual([
      7, 3, 1,
    ]);
  });

  it("suppresses milestones already marked sent", () => {
    // 7 already sent (bit 0 = 1); inside the 3-day mark only 3 remains due.
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(2.5), sentMask: 1, now: NOW })).toEqual([
      3,
    ]);
  });

  it("is a no-op once the whole mask is set, however close the deadline", () => {
    const full = markSent(0, TRIAL_REMINDER_DAYS);
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(0.1), sentMask: full, now: NOW })).toEqual(
      [],
    );
  });

  it("fires nothing for a lapsed window — the expiry engine owns that", () => {
    expect(computeDueTrialReminders({ trialEndsAt: endsIn(-1), sentMask: 0, now: NOW })).toEqual([]);
  });

  it("fires nothing for a non-trial store (no trial end)", () => {
    expect(computeDueTrialReminders({ trialEndsAt: null, sentMask: 0, now: NOW })).toEqual([]);
  });

  it("running again after marking the due set produces no repeats (idempotent)", () => {
    const input = { trialEndsAt: endsIn(2.5), now: NOW };
    const first = computeDueTrialReminders({ ...input, sentMask: 0 });
    expect(first).toEqual([7, 3]);
    const nextMask = markSent(0, first);
    expect(computeDueTrialReminders({ ...input, sentMask: nextMask })).toEqual([]);
  });
});

describe("markSent", () => {
  it("accumulates milestone bits without disturbing others", () => {
    expect(markSent(0, [7])).toBe(1);
    expect(markSent(1, [3])).toBe(3);
    expect(markSent(3, [1])).toBe(7);
    expect(markSent(7, [7, 3, 1])).toBe(7); // already-set bits are idempotent
  });
});

describe("daysUntil", () => {
  it("is positive before the deadline and negative after", () => {
    expect(daysUntil(endsIn(3), NOW)).toBeCloseTo(3);
    expect(daysUntil(endsIn(-2), NOW)).toBeCloseTo(-2);
  });
});
