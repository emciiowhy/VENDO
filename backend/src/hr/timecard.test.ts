import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { elapsedMinutes } from "./timecard.repository.js";
import { clockSchema } from "./timecard.schema.js";

const app = createApp();

describe("shift-clock routes require a store session", () => {
  it("blocks clock status for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/merchant/shifts/status")).status).toBe(401);
  });
  it("blocks clock-in for the unauthenticated with 401", async () => {
    expect((await request(app).post("/api/v1/merchant/shifts/clock-in").send({})).status).toBe(401);
  });
  it("blocks clock-out for the unauthenticated with 401", async () => {
    expect((await request(app).post("/api/v1/merchant/shifts/clock-out").send({})).status).toBe(401);
  });
  it("blocks the self-service history for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/merchant/shifts/me")).status).toBe(401);
  });
});

describe("labor analytics requires store-management auth", () => {
  it("blocks labor analytics for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/labor-analytics")).status).toBe(401);
  });
});

describe("elapsedMinutes", () => {
  const start = new Date("2026-06-16T09:00:00Z");
  it("measures a completed punch to the minute", () => {
    expect(elapsedMinutes(start, new Date("2026-06-16T17:30:00Z"))).toBe(510);
  });
  it("measures an open punch against the supplied now", () => {
    expect(elapsedMinutes(start, null, new Date("2026-06-16T11:15:00Z"))).toBe(135);
  });
  it("never goes negative when the clock is skewed backwards", () => {
    expect(elapsedMinutes(start, new Date("2026-06-16T08:00:00Z"))).toBe(0);
  });
});

describe("clockSchema", () => {
  it("accepts an empty body (a note is optional)", () => {
    expect(clockSchema.safeParse({}).success).toBe(true);
  });
  it("normalises a blank note to undefined", () => {
    expect(clockSchema.parse({ note: "   " }).note).toBeUndefined();
  });
  it("rejects a note past 240 characters", () => {
    expect(clockSchema.safeParse({ note: "x".repeat(241) }).success).toBe(false);
  });
});
