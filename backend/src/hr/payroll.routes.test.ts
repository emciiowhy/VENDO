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
const RUN = "55555555-5555-5555-5555-555555555555";
const LINE = "66666666-6666-6666-6666-666666666666";

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

describe("cashiers can't see or change payroll", () => {
  it.each([
    ["get", "/api/v1/hr/payroll"],
    ["get", `/api/v1/hr/payroll/${RUN}`],
    ["post", "/api/v1/hr/payroll"],
    ["post", `/api/v1/hr/payroll/${RUN}/approve`],
    ["put", `/api/v1/hr/payroll/${RUN}/lines/${LINE}/rate`],
    ["post", `/api/v1/hr/payroll/${RUN}/lines/${LINE}/adjustments`],
    ["patch", `/api/v1/hr/employees/${LINE}`],
  ] as const)("%s %s → 403", async (method, path) => {
    const res = await request(app)[method](path).set("Cookie", cookieFor("CASHIER")).set("Origin", ORIGIN).send({});
    expect(res.status).toBe(403);
  });
});

describe("payroll input validation (manager)", () => {
  it("rejects a period that ends before it starts", async () => {
    const res = await request(app)
      .post("/api/v1/hr/payroll")
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ periodStart: "2026-10-15", periodEnd: "2026-10-01" });
    expect(res.status).toBe(400);
  });

  it("rejects a fractional-centavo daily rate", async () => {
    const res = await request(app)
      .put(`/api/v1/hr/payroll/${RUN}/lines/${LINE}/rate`)
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ dailyRateCents: 600.5 });
    expect(res.status).toBe(400);
  });

  it("rejects a zero or label-less adjustment", async () => {
    const zero = await request(app)
      .post(`/api/v1/hr/payroll/${RUN}/lines/${LINE}/adjustments`)
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ label: "Holiday pay", amountCents: 0 });
    const noLabel = await request(app)
      .post(`/api/v1/hr/payroll/${RUN}/lines/${LINE}/adjustments`)
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ label: " ", amountCents: 5000 });
    expect([zero.status, noLabel.status]).toEqual([400, 400]);
  });

  it("404s a malformed run id instead of querying with it", async () => {
    const res = await request(app).post("/api/v1/hr/payroll/not-a-uuid/approve").set("Cookie", cookieFor("MANAGER")).set("Origin", ORIGIN);
    expect(res.status).toBe(404);
  });

  it("the old deduction export is gone", async () => {
    const res = await request(app).get("/api/v1/hr/payroll/export?from=2026-10-01&to=2026-10-15").set("Cookie", cookieFor("MANAGER"));
    expect(res.status).toBe(404);
  });
});
