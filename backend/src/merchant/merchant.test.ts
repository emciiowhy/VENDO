import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { resolveMonth, toCsv } from "./compliance.csv.js";
import type { ComplianceLedger } from "./merchant.repository.js";

const app = createApp();

describe("Merchant analytics & compliance require store-management auth", () => {
  it("blocks the dashboard pulse for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/merchant/analytics/dashboard");
    expect(res.status).toBe(401);
  });

  it("blocks the compliance export for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/merchant/compliance/export");
    expect(res.status).toBe(401);
  });

  it("blocks the predictive inventory forecast for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/merchant/analytics/forecast");
    expect(res.status).toBe(401);
  });

  it("blocks the inventory alerts engine for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/inventory/alerts");
    expect(res.status).toBe(401);
  });

  it("blocks the real-time event stream for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/merchant/events/stream");
    expect(res.status).toBe(401);
  });
});

describe("resolveMonth", () => {
  it("turns YYYY-MM into an inclusive-start / exclusive-end window", () => {
    const w = resolveMonth("2026-06");
    expect(w.periodStart).toBe("2026-06-01");
    expect(w.periodEnd).toBe("2026-07-01");
    expect(w.label).toBe("June 2026");
  });

  it("rolls December over into the next January", () => {
    const w = resolveMonth("2026-12");
    expect(w.periodStart).toBe("2026-12-01");
    expect(w.periodEnd).toBe("2027-01-01");
  });

  it("falls back to the current month for missing/garbage input", () => {
    const today = new Date(Date.UTC(2026, 2, 15)); // March 2026
    expect(resolveMonth(undefined, today).periodStart).toBe("2026-03-01");
    expect(resolveMonth("not-a-month", today).periodStart).toBe("2026-03-01");
    expect(resolveMonth("2026-13", today).periodStart).toBe("2026-03-01");
  });
});

describe("toCsv (BIR ledger export)", () => {
  const ledger: ComplianceLedger = {
    periodStart: "2026-06-01",
    periodEnd: "2026-07-01",
    rows: [
      {
        reference: "SI-000001",
        at: "2026-06-02T03:11:00.000Z",
        paymentMethod: "Cash",
        paymentRef: null,
        grossCents: 15000,
        netCents: 13393,
        vatCents: 1607,
        discountCents: 0,
      },
      {
        reference: "SI-000002",
        at: "2026-06-02T05:42:00.000Z",
        paymentMethod: "GCash",
        paymentRef: "4821",
        grossCents: 44800,
        netCents: 40000,
        vatCents: 4800,
        discountCents: 5000,
      },
    ],
    totals: { grossCents: 59800, netCents: 53393, vatCents: 6407, discountCents: 5000, count: 2 },
  };

  it("emits a header, one row per invoice, and a TOTALS line", () => {
    const csv = toCsv(ledger);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4); // header + 2 invoices + totals
    expect(lines[0]).toContain("Invoice No");
    expect(lines[0]).toContain("12% VAT");
    expect(lines[1]).toContain("SI-000001");
    expect(lines[3].startsWith("TOTALS")).toBe(true);
  });

  it("renders money as plain decimal pesos (no ₱) for spreadsheet math", () => {
    const csv = toCsv(ledger);
    expect(csv).toContain("150.00"); // 15000 cents
    expect(csv).toContain("16.07"); // 1607 cents VAT
    expect(csv).not.toContain("₱");
  });
});
