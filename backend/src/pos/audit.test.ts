import { describe, it, expect } from "vitest";
import { auditEventSchema, summarizeAudit, type AuditLog } from "./audit.js";

// Pure audit contracts + rollup maths — no database. The repository feeds
// `summarizeAudit` the same row shapes read back from pos_audit_logs.

function row(p: Partial<AuditLog> & { action: AuditLog["action"] }): AuditLog {
  return {
    id: "x",
    cashierUserId: null,
    cashierName: "Cashier",
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
    expect(s.byAction).toEqual({ void_item: 2, cancel_transaction: 1, open_drawer: 1 });
    // Voids (5000 + 2500) + cancel (18000); the drawer pop adds nothing.
    expect(s.flaggedValueCents).toBe(25500);
  });

  it("is zero-safe on an empty window", () => {
    const s = summarizeAudit([]);
    expect(s.total).toBe(0);
    expect(s.flaggedValueCents).toBe(0);
    expect(s.byAction).toEqual({ void_item: 0, cancel_transaction: 0, open_drawer: 0 });
  });
});
