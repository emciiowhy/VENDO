import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireFeature, requireMinTier, type TierResolver } from "./tier.middleware.js";
import type { Session } from "./auth.types.js";
import type { Tier } from "../lib/tiers.js";

// The guard's decision logic is exercised without a database by injecting the
// tier resolver. The live DB path (tenantTierById) is the default; here we stub
// it to drive each branch deterministically.

const OWNER: Session = {
  userId: "u1",
  tenantId: "t1",
  role: "MERCHANT_OWNER",
  email: "owner@example.com",
  name: "Owner",
};

/** A res double that records the status + JSON body the guard writes. */
function fakeRes() {
  const out: { status: number; body: unknown } = { status: 0, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, out };
}

/** Build a request carrying a pre-verified session (as requireRole would). */
function reqWith(session: Session | undefined): Request {
  return { user: session } as unknown as Request;
}

const resolves = (tier: Tier | null): TierResolver => vi.fn(async () => tier);

describe("requireMinTier", () => {
  it("calls next() when the tenant tier meets the threshold", async () => {
    const guard = requireMinTier("BUSINESS", resolves("BUSINESS"));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0); // nothing written — handler proceeds
  });

  it("calls next() when the tenant tier exceeds the threshold", async () => {
    const guard = requireMinTier("BUSINESS", resolves("ENTERPRISE"));
    const next = vi.fn();
    const { res } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects an under-tier store with 403 and the required tier", async () => {
    const guard = requireMinTier("BUSINESS", resolves("STARTER"));
    const next = vi.fn();
    const { res, out } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ ok: false, requiredTier: "BUSINESS", currentTier: "STARTER" });
  });

  it("rejects an unauthenticated request with 401 (no session at all)", async () => {
    const resolver = resolves("ENTERPRISE");
    const guard = requireMinTier("STARTER", resolver);
    const next = vi.fn();
    const { res, out } = fakeRes();
    await guard(reqWith(undefined), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(401);
    expect(resolver).not.toHaveBeenCalled(); // never reaches the tier lookup
  });

  it("rejects a session with no tenant (Super Admin) with 403", async () => {
    const guard = requireMinTier("BUSINESS", resolves("ENTERPRISE"));
    const next = vi.fn();
    const { res, out } = fakeRes();
    const admin: Session = { ...OWNER, tenantId: null, role: "SUPER_ADMIN" };
    await guard(reqWith(admin), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(403);
  });

  it("answers 500 (not a misleading 403) when the tier lookup throws", async () => {
    const guard = requireMinTier("BUSINESS", () => Promise.reject(new Error("db down")));
    const next = vi.fn();
    const { res, out } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(500);
  });
});

describe("requireFeature resolves the threshold through the matrix", () => {
  it("gates the CRM module at BUSINESS — STARTER is refused", async () => {
    const guard = requireFeature("customer_relationship_crm", resolves("STARTER"));
    const next = vi.fn();
    const { res, out } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ requiredTier: "BUSINESS" });
  });

  it("admits a BUSINESS store to a BUSINESS module (procurement)", async () => {
    const guard = requireFeature("procurement_supply_chain", resolves("BUSINESS"));
    const next = vi.fn();
    const { res } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("gates HR / payroll at ENTERPRISE — a BUSINESS store is refused", async () => {
    const guard = requireFeature("human_resources_payroll", resolves("BUSINESS"));
    const next = vi.fn();
    const { res, out } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ requiredTier: "ENTERPRISE" });
  });

  it("admits an ENTERPRISE store to an ENTERPRISE module (manufacturing)", async () => {
    const guard = requireFeature("manufacturing_bom", resolves("ENTERPRISE"));
    const next = vi.fn();
    const { res } = fakeRes();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
