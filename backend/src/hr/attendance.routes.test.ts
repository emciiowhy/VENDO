import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// Answer the tier lookup as Enterprise (People & Payroll) so requests reach the
// role and validation checks under test. No real database is touched.
vi.mock("../db.js", () => ({
  query: vi.fn(async () => ({ rows: [{ tier: "ENTERPRISE" }], rowCount: 1 })),
  pool: { connect: vi.fn(), query: vi.fn() },
}));

const { createApp } = await import("../app.js");
const { signSession } = await import("../auth/auth.jwt.js");
const { env } = await import("../env.js");

const app = createApp();
const ORIGIN = env.corsOrigins[0];
const CARD = "44444444-4444-4444-4444-444444444444";

function cookieFor(role: "CASHIER" | "MANAGER") {
  const token = signSession({
    userId: "33333333-3333-3333-3333-333333333333",
    tenantId: "22222222-2222-2222-2222-222222222222",
    role,
    email: `${role.toLowerCase()}@example.com`,
    name: role,
  });
  return `${env.session.cookieName}=${token}`;
}

describe("attendance routes are owner/manager only", () => {
  it("403s a CASHIER correcting a timecard", async () => {
    const res = await request(app)
      .patch(`/api/v1/hr/timecards/${CARD}`)
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN)
      .send({ clockOut: "2026-10-05T17:00:00+08:00" });
    expect(res.status).toBe(403);
  });

  it("403s a CASHIER reading an employee's attendance", async () => {
    const res = await request(app).get(`/api/v1/hr/employees/${CARD}/attendance`).set("Cookie", cookieFor("CASHIER"));
    expect(res.status).toBe(403);
  });

  it("rejects a manager's correction without a valid time out (400)", async () => {
    const res = await request(app)
      .patch(`/api/v1/hr/timecards/${CARD}`)
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ clockOut: "5pm" });
    expect(res.status).toBe(400);
  });

  it("404s a malformed timecard id instead of querying with it", async () => {
    const res = await request(app)
      .patch("/api/v1/hr/timecards/not-a-uuid")
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ clockOut: "2026-10-05T17:00:00+08:00" });
    expect(res.status).toBe(404);
  });
});
