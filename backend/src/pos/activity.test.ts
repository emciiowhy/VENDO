import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Capture every SQL statement so we can see what the activity log would write,
// and answer the tier lookup as Enterprise. No real database is touched.
const calls: { sql: string; params: unknown[] }[] = [];
vi.mock("../db.js", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/FROM pos_audit_logs/.test(sql)) return { rows: [], rowCount: 0 };
    return { rows: [{ tier: "ENTERPRISE" }], rowCount: 1 };
  }),
  pool: { connect: vi.fn(), query: vi.fn() },
}));

const { createApp } = await import("../app.js");
const { signSession } = await import("../auth/auth.jwt.js");
const { env } = await import("../env.js");

const app = createApp();
const TENANT = "22222222-2222-2222-2222-222222222222";
const ORIGIN = env.corsOrigins[0];

function cookieFor(role: "CASHIER" | "MANAGER" | "MERCHANT_OWNER") {
  const token = signSession({
    userId: "33333333-3333-3333-3333-333333333333",
    tenantId: TENANT,
    role,
    email: `${role.toLowerCase()}@example.com`,
    name: `Test ${role}`,
  });
  return `${env.session.cookieName}=${token}`;
}

beforeEach(() => {
  calls.length = 0;
});

describe("activity log access", () => {
  it("403s a CASHIER reading the store's activity log", async () => {
    const res = await request(app).get("/api/v1/pos/audit").set("Cookie", cookieFor("CASHIER"));
    expect(res.status).toBe(403);
  });

  it.each(["MANAGER", "MERCHANT_OWNER"] as const)("lets a %s read it, scoped to their own store", async (role) => {
    const res = await request(app).get("/api/v1/pos/audit?action=sale").set("Cookie", cookieFor(role));
    expect(res.status).toBe(200);
    const listQuery = calls.find((c) => /FROM pos_audit_logs/.test(c.sql) && /ORDER BY created_at DESC/.test(c.sql));
    expect(listQuery?.params[0]).toBe(TENANT);
    expect(listQuery?.params).toContain("sale");
  });

  it("ignores a malformed filter instead of passing it to SQL", async () => {
    await request(app)
      .get("/api/v1/pos/audit?action=drop_table&userId=not-a-uuid&from=yesterday")
      .set("Cookie", cookieFor("MERCHANT_OWNER"));
    const listQuery = calls.find((c) => /ORDER BY created_at DESC/.test(c.sql));
    expect(listQuery?.params).toEqual([TENANT, 200]);
  });

  it("refuses a register POSTing a server-only event (a 'sale' can't be forged)", async () => {
    const res = await request(app)
      .post("/api/v1/pos/audit")
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN)
      .send({ action: "sale", valueCents: 100 });
    expect(res.status).toBe(400);
  });
});

describe("sign-out is recorded", () => {
  it("writes a logout row for the signed-in user's store", async () => {
    const res = await request(app).post("/auth/logout").set("Cookie", cookieFor("CASHIER")).set("Origin", ORIGIN);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // the log write is fire-and-forget
    const insert = calls.find((c) => /INSERT INTO pos_audit_logs/.test(c.sql));
    expect(insert?.params.slice(0, 4)).toEqual([TENANT, "33333333-3333-3333-3333-333333333333", "Test CASHIER", "logout"]);
  });
});

describe("attendance corrections are recorded", () => {
  it("writes a timecard_corrected row naming the employee and the day", async () => {
    const employeeId = "44444444-4444-4444-4444-444444444444";
    const res = await request(app)
      .put("/api/v1/hr/attendance")
      .set("Cookie", cookieFor("MERCHANT_OWNER"))
      .set("Origin", ORIGIN)
      .send({ employeeId, workDate: "2026-10-19", status: "Absent" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // the log write is fire-and-forget
    const insert = calls.find((c) => /INSERT INTO pos_audit_logs/.test(c.sql));
    expect(insert?.params[0]).toBe(TENANT);
    expect(insert?.params[3]).toBe("timecard_corrected");
    expect(insert?.params[4]).toBe(employeeId);
    expect(insert?.params[8]).toContain("2026-10-19");
  });
});
