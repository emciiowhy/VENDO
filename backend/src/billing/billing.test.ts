import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { PLAN_SPECS, asPlan, productLimitFor } from "./plans.js";

const app = createApp();

describe("Billing analytics is SUPER_ADMIN-only", () => {
  it("blocks an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/v1/admin/analytics/billing");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("blocks the subscriber directory unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/admin/analytics/subscribers");
    expect(res.status).toBe(401);
  });
});

describe("Plan catalogue", () => {
  it("prices are positive integer centavos in ascending tier order", () => {
    expect(PLAN_SPECS.starter.priceCents).toBeGreaterThan(0);
    expect(PLAN_SPECS.business.priceCents).toBeGreaterThan(PLAN_SPECS.starter.priceCents);
    expect(PLAN_SPECS.enterprise.priceCents).toBeGreaterThan(PLAN_SPECS.business.priceCents);
    for (const p of Object.values(PLAN_SPECS)) {
      expect(Number.isInteger(p.priceCents)).toBe(true);
    }
  });

  it("caps Starter/Business product capacity but leaves Enterprise unlimited", () => {
    expect(productLimitFor("starter")).toBeGreaterThan(0);
    expect(productLimitFor("business")).toBeGreaterThan(productLimitFor("starter")!);
    expect(productLimitFor("enterprise")).toBeNull();
  });

  it("coerces unknown/blank plan strings to Starter", () => {
    expect(asPlan("business")).toBe("business");
    expect(asPlan("enterprise")).toBe("enterprise");
    expect(asPlan("bogus")).toBe("starter");
    expect(asPlan(null)).toBe("starter");
    expect(asPlan(undefined)).toBe("starter");
  });
});
