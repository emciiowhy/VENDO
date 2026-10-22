import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { movementWhere } from "./stockLedger.js";

const T = "11111111-1111-1111-1111-111111111111";
const P = "22222222-2222-2222-2222-222222222222";

describe("movementWhere", () => {
  it("fences to the tenant alone when unfiltered", () => {
    expect(movementWhere(T, {})).toEqual({ where: "m.tenant_id = $1", params: [T] });
  });

  it("numbers every filter's placeholder in order", () => {
    const { where, params } = movementWhere(T, {
      reasons: ["sale_void", "return"],
      productId: P,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(params).toEqual([T, ["sale_void", "return"], P, "2026-10-01", "2026-10-31"]);
    expect(where).toContain("m.reason = ANY($2::text[])");
    expect(where).toContain("m.product_id = $3");
    expect(where).toContain("$4::date");
    expect(where).toContain("($5::date + 1)");
  });

  it("treats an empty reason list as no reason filter", () => {
    expect(movementWhere(T, { reasons: [] }).params).toEqual([T]);
  });
});

describe("Stock history routes are fenced to store management", () => {
  const app = createApp();
  it("blocks the store-wide feed for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/inventory/movements?type=sales")).status).toBe(401);
  });
  it("blocks one product's history for the unauthenticated with 401", async () => {
    expect((await request(app).get(`/api/v1/inventory/products/${P}/movements`)).status).toBe(401);
  });
});
