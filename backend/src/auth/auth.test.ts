import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { hashPin, verifyPin, hashPassword, verifyPassword, sign, unsign } from "./auth.crypto.js";
import { dashboardPathForRole } from "./auth.types.js";

// The crypto + role logic needs no database — these are the pure seams, tested
// the way the Lead capture seam is (behaviour, no Neon connection required).

beforeAll(() => {
  // sign()/unsign() bind to JWT_SECRET; set a deterministic one for the test.
  process.env.JWT_SECRET = "test-secret-for-state-signing";
});

describe("cashier PIN hashing", () => {
  it("verifies a correct PIN and rejects a wrong one", () => {
    const stored = hashPin("4921");
    expect(verifyPin("4921", stored)).toBe(true);
    expect(verifyPin("0000", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", () => {
    expect(hashPin("4921")).not.toBe(hashPin("4921"));
  });

  it("rejects against missing or malformed stored hashes", () => {
    expect(verifyPin("4921", null)).toBe(false);
    expect(verifyPin("4921", "garbage")).toBe(false);
  });
});

describe("owner/manager password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("Correct Horse Battery", stored)).toBe(false);
  });

  it("produces a different hash each time (salted) and is distinct from a PIN hash", () => {
    expect(hashPassword("hunter2!!")).not.toBe(hashPassword("hunter2!!"));
    // A PIN hash (scrypt$) must never verify through the password path (pw1$).
    expect(verifyPassword("4921", hashPin("4921"))).toBe(false);
  });

  it("rejects against missing or malformed stored hashes", () => {
    expect(verifyPassword("whatever", null)).toBe(false);
    expect(verifyPassword("whatever", "garbage")).toBe(false);
  });
});

describe("OAuth state signing (CSRF)", () => {
  it("round-trips a signed value", () => {
    const signed = sign("nonce-abc");
    expect(unsign(signed)).toBe("nonce-abc");
  });

  it("rejects a tampered value", () => {
    const signed = sign("nonce-abc");
    expect(unsign(signed.replace("nonce-abc", "nonce-xyz"))).toBeNull();
    expect(unsign("no-signature")).toBeNull();
    expect(unsign(undefined)).toBeNull();
  });
});

describe("role → dashboard routing", () => {
  it("sends the Super Admin to the platform command center", () => {
    expect(dashboardPathForRole("SUPER_ADMIN")).toBe("/admin");
  });

  it("sends owners and managers to the store dashboard", () => {
    expect(dashboardPathForRole("MERCHANT_OWNER")).toBe("/dashboard");
    expect(dashboardPathForRole("MANAGER")).toBe("/dashboard");
  });

  it("sends cashiers to the locked POS terminal", () => {
    expect(dashboardPathForRole("CASHIER")).toBe("/pos");
  });
});

describe("owner-dashboard impersonation is SUPER_ADMIN-only", () => {
  const app = createApp();

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app)
      .post("/auth/impersonate")
      .send({ tenantId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });
});

describe("owner/manager password sign-in", () => {
  const app = createApp();

  it("rejects a password login missing fields with 400", async () => {
    const res = await request(app).post("/auth/password-login").send({ storeId: "kape-ni-juan" });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("blocks reading password status unauthenticated with 401", async () => {
    const res = await request(app).get("/auth/password/status");
    expect(res.status).toBe(401);
  });

  it("blocks setting a password unauthenticated with 401", async () => {
    const res = await request(app).post("/auth/password").send({ newPassword: "longenough1" });
    expect(res.status).toBe(401);
  });
});
