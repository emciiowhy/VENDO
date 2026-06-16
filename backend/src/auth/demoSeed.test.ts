import { describe, it, expect } from "vitest";
import { buildLaborHistory, DEMO_CASHIERS } from "./demoSeed.js";

const NOW = new Date("2026-06-17T14:30:00");
const { shifts, sales } = buildLaborHistory(NOW);

describe("buildLaborHistory — timecards", () => {
  it("seeds 7 completed days per cashier plus a single active shift", () => {
    const completed = shifts.filter((s) => s.status === "COMPLETED");
    const active = shifts.filter((s) => s.status === "ACTIVE");
    expect(completed.length).toBe(DEMO_CASHIERS.length * 7);
    // Exactly one ACTIVE row — the partial unique index forbids two per user, and
    // this guarantees the whole seed never trips it.
    expect(active.length).toBe(1);
  });

  it("never leaves more than one active card for any single cashier", () => {
    const activePerCashier = new Map<number, number>();
    for (const s of shifts.filter((s) => s.status === "ACTIVE")) {
      activePerCashier.set(s.cashierIndex, (activePerCashier.get(s.cashierIndex) ?? 0) + 1);
    }
    for (const count of activePerCashier.values()) expect(count).toBe(1);
  });

  it("gives every completed card a punch-out after its punch-in", () => {
    for (const s of shifts.filter((s) => s.status === "COMPLETED")) {
      expect(s.clockOut).not.toBeNull();
      expect(s.clockOut!.getTime()).toBeGreaterThan(s.clockIn.getTime());
      const hours = (s.clockOut!.getTime() - s.clockIn.getTime()) / 3_600_000;
      expect(hours).toBeGreaterThanOrEqual(6);
      expect(hours).toBeLessThanOrEqual(8);
    }
  });

  it("leaves the active card open (null clock-out) and recent", () => {
    const active = shifts.find((s) => s.status === "ACTIVE")!;
    expect(active.clockOut).toBeNull();
    expect(active.clockIn.getTime()).toBeLessThan(NOW.getTime());
    expect(active.clockIn.getTime()).toBeGreaterThan(NOW.getTime() - 6 * 3_600_000);
  });

  it("spans 7 distinct days for each cashier", () => {
    for (let ci = 0; ci < DEMO_CASHIERS.length; ci++) {
      const days = new Set(
        shifts
          .filter((s) => s.cashierIndex === ci && s.status === "COMPLETED")
          .map((s) => s.clockIn.toDateString()),
      );
      expect(days.size).toBe(7);
    }
  });
});

describe("buildLaborHistory — sales", () => {
  it("rings sales for every completed shift", () => {
    expect(sales.length).toBe(DEMO_CASHIERS.length * 7 * 4);
    for (const sale of sales) expect(sale.lines.length).toBeGreaterThan(0);
  });

  it("lands every sale inside a real shift window for the same cashier", () => {
    const windows = shifts
      .filter((s) => s.status === "COMPLETED")
      .map((s) => ({ ci: s.cashierIndex, from: s.clockIn.getTime(), to: s.clockOut!.getTime() }));
    for (const sale of sales) {
      const t = sale.createdAt.getTime();
      const inSomeShift = windows.some((w) => w.ci === sale.cashierIndex && t >= w.from && t <= w.to);
      expect(inSomeShift).toBe(true);
    }
  });
});
