import type { Request, Response, NextFunction } from "express";
import { sessionFromRequest } from "../auth/auth.middleware.js";
import { evaluateTenantStatus, type TenantStatusResult } from "./trial.js";

/**
 * Trial checkpoint — the server-side boundary that fences a lapsed-trial store
 * out of the dashboard modules. Mounted once ahead of the merchant route block
 * (see app.ts), it runs the lazy status evaluation for the session's tenant and,
 * when the trial has expired, answers 402 Payment Required with a `recovery`
 * marker so the workspace can route to the graceful billing/recovery view.
 *
 * Three deliberate non-actions keep it safe to mount broadly:
 *  • No session / no tenant (the Super Admin) → next(): this is not an auth gate,
 *    so an unauthenticated request still falls through to the route's own
 *    requireRole and gets its usual 401.
 *  • Any non-expired status (trial / active) → next().
 *  • A status-lookup error → next() (FAIL OPEN): a transient DB blip must never
 *    lock a paying store out of its own workspace; the error is logged.
 */

/** The status resolver, injectable so the guard's branches unit-test without a DB. */
export type StatusEvaluator = (tenantId: string) => Promise<TenantStatusResult | null>;

export function enforceTrialStatus(evaluate: StatusEvaluator = evaluateTenantStatus) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = req.user ?? sessionFromRequest(req);
    // Not our concern: unauthenticated requests and tenant-less sessions (the
    // platform Super Admin) are handled by the downstream role guards.
    if (!session || !session.tenantId) {
      next();
      return;
    }
    try {
      const result = await evaluate(session.tenantId);
      if (result?.status === "trial_expired") {
        res.status(402).json({
          ok: false,
          error: "Your 14-day free trial has ended. Choose a plan to reactivate your store.",
          status: "trial_expired",
          trialEndsAt: result.trialEndsAt,
          recovery: true,
        });
        return;
      }
      next();
    } catch (err) {
      // Fail open — a status-check blip must not masquerade as an expired store.
      console.error("[trial] checkpoint could not resolve tenant status:", err);
      next();
    }
  };
}
