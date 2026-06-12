import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("Staff PIN administration is owner-fenced", () => {
  it("blocks the cashier roster for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/staff/cashiers");
    expect(res.status).toBe(401);
  });

  it("blocks setting a cashier PIN for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post("/api/v1/staff/cashiers/00000000-0000-0000-0000-000000000000/pin")
      .send({ pin: "1234" });
    expect(res.status).toBe(401);
  });

  it("blocks adding a cashier for the unauthenticated with 401", async () => {
    const res = await request(app).post("/api/v1/staff/cashiers").send({ name: "Test" });
    expect(res.status).toBe(401);
  });

  it("blocks editing a cashier for the unauthenticated with 401", async () => {
    const res = await request(app)
      .patch("/api/v1/staff/cashiers/00000000-0000-0000-0000-000000000000")
      .send({ status: "disabled" });
    expect(res.status).toBe(401);
  });

  it("blocks deleting a cashier for the unauthenticated with 401", async () => {
    const res = await request(app).delete(
      "/api/v1/staff/cashiers/00000000-0000-0000-0000-000000000000",
    );
    expect(res.status).toBe(401);
  });

  it("blocks force-closing a cashier's shift for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post("/api/v1/staff/cashiers/00000000-0000-0000-0000-000000000000/close-shift")
      .send({});
    expect(res.status).toBe(401);
  });
});

describe("Public forgot-PIN seam", () => {
  it("rejects a forgot request with no cashier profile (400)", async () => {
    const res = await request(app).post("/auth/pin/forgot").send({ storeId: "kape-ni-juan" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("rejects a forgot request that identifies no store (401)", async () => {
    const res = await request(app)
      .post("/auth/pin/forgot")
      .send({ cashierId: "11111111-1111-1111-1111-111111111111" });
    expect(res.status).toBe(401);
  });

  it("rejects a cashier listing with no store identified (401)", async () => {
    const res = await request(app).post("/auth/cashiers").send({});
    expect(res.status).toBe(401);
  });
});
