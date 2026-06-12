import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("Tenant control plane is SUPER_ADMIN-only", () => {
  it("blocks listing tenants unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/admin/tenants");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it("blocks patching a tenant unauthenticated with 401", async () => {
    const res = await request(app)
      .patch("/api/v1/admin/tenants/00000000-0000-0000-0000-000000000000")
      .send({ status: "suspended" });
    expect(res.status).toBe(401);
  });
});
