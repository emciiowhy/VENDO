import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { enforceTrialStatus, type StatusEvaluator } from "./trial.middleware.js";
import { renderTrialExpiredEmail } from "../notifications/trialExpiredEmail.js";
import type { Session } from "../auth/auth.types.js";
import type { TenantStatusResult } from "./trial.js";

// The checkpoint's branches are exercised without a database by injecting the
// status evaluator (mirrors tier.middleware.test.ts). The live DB path
// (evaluateTenantStatus) is the default; here we stub it to drive each branch.

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

const resolves = (result: TenantStatusResult | null): StatusEvaluator => vi.fn(async () => result);

describe("enforceTrialStatus checkpoint", () => {
  it("calls next() for an active store", async () => {
    const guard = enforceTrialStatus(resolves({ status: "active", trialEndsAt: null }));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0); // nothing written — request proceeds
  });

  it("calls next() for a store still inside its trial window", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const guard = enforceTrialStatus(resolves({ status: "trial", trialEndsAt: future }));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0);
  });

  it("blocks a lapsed trial with 402 + a recovery marker (no next)", async () => {
    const ended = new Date(Date.now() - 86_400_000).toISOString();
    const guard = enforceTrialStatus(resolves({ status: "trial_expired", trialEndsAt: ended }));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(OWNER), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(402);
    expect(out.body).toMatchObject({ ok: false, status: "trial_expired", recovery: true });
  });

  it("is a no-op (next) for an unauthenticated request — the role guard answers", async () => {
    const evaluate = resolves({ status: "trial_expired", trialEndsAt: null });
    const guard = enforceTrialStatus(evaluate);
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(undefined), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0);
    expect(evaluate).not.toHaveBeenCalled(); // never reaches the status lookup
  });

  it("is a no-op (next) for a tenant-less Super Admin session", async () => {
    const evaluate = resolves({ status: "trial_expired", trialEndsAt: null });
    const guard = enforceTrialStatus(evaluate);
    const { res } = fakeRes();
    const next = vi.fn();
    const admin: Session = { ...OWNER, tenantId: null, role: "SUPER_ADMIN" };
    await guard(reqWith(admin), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("fails OPEN (next) when the status lookup throws — never locks a store out on a blip", async () => {
    const guard = enforceTrialStatus(() => Promise.reject(new Error("db down")));
    const { res, out } = fakeRes();
    const next = vi.fn();
    await guard(reqWith(OWNER), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(out.status).toBe(0);
  });
});

describe("renderTrialExpiredEmail", () => {
  const base = {
    ownerName: "Juan",
    ownerEmail: "juan@store.ph",
    storeName: "Kape ni Juan",
    plan: "business",
  };

  it("addresses the owner, names the store, and links to pricing to recover", () => {
    const mail = renderTrialExpiredEmail({ ...base, trialEndedAt: "2026-06-01T00:00:00.000Z" });
    expect(mail.subject).toContain("Kape ni Juan");
    expect(mail.text).toContain("Hi Juan,");
    expect(mail.text).toContain("/#pricing");
    expect(mail.html).toContain("/#pricing");
    expect(mail.text).toContain("Business"); // plan label
  });

  it("omits the 'ended on' date gracefully when the timestamp is absent", () => {
    const mail = renderTrialExpiredEmail({ ...base, trialEndedAt: null });
    expect(mail.text).toContain("has ended");
    expect(mail.text).not.toContain("ended on null");
  });
});
