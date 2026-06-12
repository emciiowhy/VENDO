import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

describe("System Health stream is SUPER_ADMIN-only", () => {
  it("blocks an unauthenticated EventSource handshake with 401", async () => {
    const res = await request(app).get("/api/v1/admin/health/stream");
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});
