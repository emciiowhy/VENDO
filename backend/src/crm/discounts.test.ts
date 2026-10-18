import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// The only DB read these guards make is the tier lookup — answer it as an
// Enterprise tenant so every request reaches the role check under test.
vi.mock("../db.js", () => ({
  query: vi.fn(async () => ({ rows: [{ tier: "ENTERPRISE" }], rowCount: 1 })),
  pool: { connect: vi.fn(), query: vi.fn() },
}));

const { createApp } = await import("../app.js");
const { signSession } = await import("../auth/auth.jwt.js");
const { env } = await import("../env.js");
const { discountSettingsSchema } = await import("./crm.schema.js");

const app = createApp();
const TENANT = "22222222-2222-2222-2222-222222222222";
const ORIGIN = env.corsOrigins[0];

function cookieFor(role: "CASHIER" | "MANAGER" | "MERCHANT_OWNER") {
  const token = signSession({
    userId: "33333333-3333-3333-3333-333333333333",
    tenantId: TENANT,
    role,
    email: `${role.toLowerCase()}@example.com`,
    name: role,
  });
  return `${env.session.cookieName}=${token}`;
}

const validSettings = { pesosPerPoint: 100, pointValueCents: 100, memberDiscountPct: 5, memberMinSpendCents: 0 };

describe("CRM discount settings — cashiers cannot change discounts", () => {
  it("403s a CASHIER saving discount settings", async () => {
    const res = await request(app)
      .put("/api/v1/crm/discount-settings")
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN)
      .send(validSettings);
    expect(res.status).toBe(403);
  });

  it("lets a MANAGER through the role guard (invalid body → 400, not 403)", async () => {
    const res = await request(app)
      .put("/api/v1/crm/discount-settings")
      .set("Cookie", cookieFor("MANAGER"))
      .set("Origin", ORIGIN)
      .send({ ...validSettings, memberDiscountPct: 80 });
    expect(res.status).toBe(400);
  });

  it("403s a CASHIER editing or deleting a customer", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const patch = await request(app)
      .patch(`/api/v1/crm/customers/${id}`)
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN)
      .send({ name: "X" });
    const del = await request(app)
      .delete(`/api/v1/crm/customers/${id}`)
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN);
    expect(patch.status).toBe(403);
    expect(del.status).toBe(403);
  });

  it("rejects a cashier's free-form discount at checkout with 400", async () => {
    const res = await request(app)
      .post("/api/v1/pos/orders")
      .set("Cookie", cookieFor("CASHIER"))
      .set("Origin", ORIGIN)
      .send({
        items: [{ productId: "11111111-1111-1111-1111-111111111111", qty: 1 }],
        paymentMethod: "Cash",
        tenderedCents: 100_000,
        discount: { type: "percent", value: 100 },
      });
    expect(res.status).toBe(400);
  });
});

describe("discountSettingsSchema", () => {
  it("accepts sane settings", () => {
    expect(discountSettingsSchema.safeParse(validSettings).success).toBe(true);
  });
  it("caps the member discount at 50%", () => {
    expect(discountSettingsSchema.safeParse({ ...validSettings, memberDiscountPct: 51 }).success).toBe(false);
  });
  it("rejects a zero point value", () => {
    expect(discountSettingsSchema.safeParse({ ...validSettings, pointValueCents: 0 }).success).toBe(false);
  });
});
