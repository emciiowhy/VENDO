import { describe, it, expect } from "vitest";
import { auditEventSchema, maskId, summarizeAudit, type AuditLog } from "./audit.js";

// Pure audit contracts + rollup maths — no database. The repository feeds
// `summarizeAudit` the same row shapes read back from pos_audit_logs.

function row(p: Partial<AuditLog> & { action: AuditLog["action"] }): AuditLog {
  return {
    id: "x",
    cashierUserId: null,
    cashierName: "Cashier",
    refId: null,
    itemName: null,
    itemQty: null,
    valueCents: 0,
    detail: null,
    createdAt: "2026-06-15T00:00:00.000Z",
    ...p,
  };
}

describe("auditEventSchema", () => {
  it("accepts a void-item event with line value", () => {
    const parsed = auditEventSchema.safeParse({
      action: "void_item",
      itemName: "Cold Brew",
      itemQty: 2,
      valueCents: 24000,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a bare drawer-pop event", () => {
    expect(auditEventSchema.safeParse({ action: "open_drawer" }).success).toBe(true);
  });

  it("rejects an unknown action", () => {
    expect(auditEventSchema.safeParse({ action: "delete_db" }).success).toBe(false);
  });

  it("rejects a negative value", () => {
    expect(
      auditEventSchema.safeParse({ action: "void_item", valueCents: -1 }).success,
    ).toBe(false);
  });
});

describe("summarizeAudit", () => {
  it("tallies per action and sums flagged value (drawer pops excluded)", () => {
    const s = summarizeAudit([
      row({ action: "void_item", valueCents: 5000 }),
      row({ action: "void_item", valueCents: 2500 }),
      row({ action: "cancel_transaction", valueCents: 18000 }),
      row({ action: "open_drawer", valueCents: 0 }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byAction).toMatchObject({ void_item: 2, cancel_transaction: 1, open_drawer: 1, sale: 0 });
    // Voids (5000 + 2500) + cancel (18000); the drawer pop adds nothing.
    expect(s.flaggedValueCents).toBe(25500);
  });

  it("is zero-safe on an empty window", () => {
    const s = summarizeAudit([]);
    expect(s.total).toBe(0);
    expect(s.flaggedValueCents).toBe(0);
    expect(Object.values(s.byAction).every((n) => n === 0)).toBe(true);
  });
});

describe("activity log — server-only actions", () => {
  it("refuses a client POSTing a server action (sale/login can't be forged)", () => {
    for (const action of ["sale", "login", "clock_in", "payroll_approved", "discount_applied"]) {
      expect(auditEventSchema.safeParse({ action }).success, action).toBe(false);
    }
  });

  it("flags voided sales and refunds alongside cart voids, but not plain sales", () => {
    const s = summarizeAudit([
      row({ action: "sale", valueCents: 99_999 }),
      row({ action: "void_sale", valueCents: 1_000 }),
      row({ action: "refund", valueCents: 500 }),
      row({ action: "login", valueCents: 0 }),
    ]);
    expect(s.flaggedValueCents).toBe(1_500);
    expect(s.byAction.sale).toBe(1);
    expect(s.byAction.login).toBe(1);
  });

  it("masks Senior/PWD IDs to the last 4 characters", () => {
    expect(maskId("OSCA-123456")).toBe("••••3456");
    expect(maskId("12")).toBe("••••");
  });
});

describe("summarizeCounts (paged log totals)", () => {
  it("matches summarizeAudit for the same rows", async () => {
    const { summarizeCounts } = await import("./audit.js");
    const rows = [
      row({ action: "sale", valueCents: 10_000 }),
      row({ action: "sale", valueCents: 5_000 }),
      row({ action: "void_sale", valueCents: 2_000 }),
      row({ action: "refund", valueCents: 700 }),
    ];
    const counts = [
      { action: "sale" as const, count: 2, valueCents: 15_000 },
      { action: "void_sale" as const, count: 1, valueCents: 2_000 },
      { action: "refund" as const, count: 1, valueCents: 700 },
    ];
    expect(summarizeCounts(counts)).toEqual(summarizeAudit(rows));
  });
});
