import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { tillAccessSchema } from "./hr.schema.js";

const app = createApp();
const UUID = "00000000-0000-0000-0000-000000000000";

/**
 * The HR till-access bridge (ADR 0002). The repository's transactional
 * provision/link logic and lifecycle coupling need a database, which this
 * harness doesn't provide — so here we lock down the two seams that don't:
 * the router-level auth/tier fence, and the request validation schema.
 */
describe("HR till-access routes are fenced to authenticated store staff", () => {
  it("blocks the unlinked-cashiers list for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/hr/cashiers/unlinked");
    expect(res.status).toBe(401);
  });

  it("blocks granting till access for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post(`/api/v1/hr/employees/${UUID}/till-access`)
      .send({ mode: "create", pin: "1234" });
    expect(res.status).toBe(401);
  });
});

describe("tillAccessSchema validates the grant payload", () => {
  it("accepts a create with an optional PIN and float", () => {
    const r = tillAccessSchema.parse({ mode: "create", pin: "1234", defaultFloatCents: 50000 });
    expect(r).toEqual({ mode: "create", pin: "1234", defaultFloatCents: 50000 });
  });

  it("accepts a create with no PIN, defaulting the float to 0", () => {
    const r = tillAccessSchema.parse({ mode: "create" });
    expect(r).toEqual({ mode: "create", defaultFloatCents: 0 });
  });

  it("accepts a link to an existing cashier by id", () => {
    const r = tillAccessSchema.parse({ mode: "link", cashierUserId: UUID });
    expect(r).toEqual({ mode: "link", cashierUserId: UUID });
  });

  it("rejects a PIN that isn't exactly 4 digits", () => {
    expect(tillAccessSchema.safeParse({ mode: "create", pin: "12" }).success).toBe(false);
    expect(tillAccessSchema.safeParse({ mode: "create", pin: "12345" }).success).toBe(false);
    expect(tillAccessSchema.safeParse({ mode: "create", pin: "abcd" }).success).toBe(false);
  });

  it("rejects a negative float", () => {
    expect(tillAccessSchema.safeParse({ mode: "create", defaultFloatCents: -1 }).success).toBe(false);
  });

  it("rejects a link without a valid cashier uuid", () => {
    expect(tillAccessSchema.safeParse({ mode: "link", cashierUserId: "nope" }).success).toBe(false);
  });

  it("rejects an unknown mode", () => {
    expect(tillAccessSchema.safeParse({ mode: "teleport" }).success).toBe(false);
  });
});
