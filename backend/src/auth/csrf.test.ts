import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

/**
 * The Origin-based CSRF guard fences every mutating request to the CORS
 * allowlist (http://localhost:3000 in the test/dev default). We probe it
 * through POST /auth/logout: it's a mutating route that needs no auth and no
 * body, so the response status isolates the guard's decision.
 */
describe("CSRF origin guard", () => {
  it("rejects a mutating request from a foreign Origin", async () => {
    const res = await request(app)
      .post("/auth/logout")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });

  it("rejects a mutating request whose Referer is a foreign origin", async () => {
    const res = await request(app)
      .post("/auth/logout")
      .set("Referer", "https://evil.example/attack.html");
    expect(res.status).toBe(403);
  });

  it("allows a mutating request from an allowlisted Origin", async () => {
    const res = await request(app)
      .post("/auth/logout")
      .set("Origin", "http://localhost:3000");
    expect(res.status).not.toBe(403);
  });

  it("allows a mutating request when neither Origin nor Referer is present", async () => {
    const res = await request(app).post("/auth/logout");
    expect(res.status).not.toBe(403);
  });

  it("never blocks a read-only request, even from a foreign Origin", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
