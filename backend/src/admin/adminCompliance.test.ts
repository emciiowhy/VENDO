import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { toPlatformCsv } from "./adminCompliance.csv.js";
import type { PlatformComplianceSummary } from "./adminCompliance.repository.js";

const app = createApp();

describe("Super Admin compliance is fenced to SUPER_ADMIN", () => {
  it("blocks the platform summary for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/admin/compliance/summary");
    expect(res.status).toBe(401);
  });

  it("blocks the consolidated CSV export for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/admin/compliance/export");
    expect(res.status).toBe(401);
  });
});

describe("toPlatformCsv (consolidated VAT export)", () => {
  const summary: PlatformComplianceSummary = {
    periodStart: "2026-06-01",
    periodEnd: "2026-07-01",
    rows: [
      {
        tenantId: "t1",
        tenant: "Aling Nena, Inc.",
        plan: "business",
        invoiceCount: 12,
        reversalCount: 1,
        grossCents: 448000,
        netCents: 400000,
        vatCents: 48000,
        discountCents: 5000,
        firstSerial: "SI-000001",
        lastSerial: "SI-000012",
      },
      {
        tenantId: "t2",
        tenant: "Quiet Mart",
        plan: "starter",
        invoiceCount: 0,
        reversalCount: 0,
        grossCents: 0,
        netCents: 0,
        vatCents: 0,
        discountCents: 0,
        firstSerial: null,
        lastSerial: null,
      },
    ],
    totals: {
      filedStores: 1,
      silentStores: 1,
      invoiceCount: 12,
      reversalCount: 1,
      grossCents: 448000,
      netCents: 400000,
      vatCents: 48000,
      discountCents: 5000,
    },
  };

  it("emits a header, one row per store, and a TOTALS line", () => {
    const csv = toPlatformCsv(summary);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4); // header + 2 stores + totals
    expect(lines[0]).toContain("Store");
    expect(lines[0]).toContain("12% VAT");
    expect(lines[3].startsWith("TOTALS")).toBe(true);
    expect(lines[3]).toContain("1 filing / 1 silent");
  });

  it("quotes the store name with a comma and renders plain decimal pesos", () => {
    const csv = toPlatformCsv(summary);
    expect(csv).toContain('"Aling Nena, Inc."'); // RFC-4180 quoting
    expect(csv).toContain("4480.00"); // 448000 cents gross
    expect(csv).toContain("480.00"); // 48000 cents VAT
    expect(csv).not.toContain("₱");
  });
});
