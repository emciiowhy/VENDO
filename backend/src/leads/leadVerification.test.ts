import { describe, it, expect } from "vitest";
import { createVerifyToken, hashVerifyToken, VERIFY_TTL_MS } from "./leadVerification.js";

describe("lead email-verification token", () => {
  it("hashes deterministically (same input → same hash)", () => {
    expect(hashVerifyToken("abc")).toBe(hashVerifyToken("abc"));
    expect(hashVerifyToken("abc")).not.toBe(hashVerifyToken("abd"));
  });

  it("mints a token whose stored hash matches hashVerifyToken(raw)", () => {
    const t = createVerifyToken();
    expect(t.hash).toBe(hashVerifyToken(t.raw));
  });

  it("stores only the hash, never the raw token", () => {
    const t = createVerifyToken();
    expect(t.hash).not.toBe(t.raw);
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
  });

  it("produces a unique raw token each call", () => {
    const a = createVerifyToken();
    const b = createVerifyToken();
    expect(a.raw).not.toBe(b.raw);
  });

  it("sets expiry VERIFY_TTL_MS from the given clock", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const t = createVerifyToken(now);
    expect(t.expiresAt.getTime()).toBe(now.getTime() + VERIFY_TTL_MS);
  });
});
