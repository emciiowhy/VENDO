import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

const validLead = {
  name: "Juan dela Cruz",
  businessName: "Kape ni Juan",
  email: "juan@kapenijuan.ph",
  phone: "0917 123 4567",
  businessType: "Coffee shop / Café",
};

describe("POST /api/leads validation (the Lead capture seam)", () => {
  it("rejects an empty payload with field errors and records nothing", async () => {
    const res = await request(app).post("/api/leads").send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.errors).toHaveProperty("name");
    expect(res.body.errors).toHaveProperty("businessName");
    expect(res.body.errors).toHaveProperty("email");
    expect(res.body.errors).toHaveProperty("phone");
    expect(res.body.errors).toHaveProperty("businessType");
  });

  it("rejects a malformed email", async () => {
    const res = await request(app)
      .post("/api/leads")
      .send({ ...validLead, email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("email");
  });

  it("rejects an empty business name", async () => {
    const res = await request(app)
      .post("/api/leads")
      .send({ ...validLead, businessName: "   " });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("businessName");
  });

  it("rejects an unknown business type", async () => {
    const res = await request(app)
      .post("/api/leads")
      .send({ ...validLead, businessType: "Spaceport" });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("businessType");
  });

  it("health check responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
