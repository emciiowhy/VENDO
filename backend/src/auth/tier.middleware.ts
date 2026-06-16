import type { Request, Response, NextFunction } from "express";
import { sessionFromRequest } from "./auth.middleware.js";
import { tenantTierById } from "./auth.repository.js";
import {
  TIER_LABEL,
  minTierForFeature,
  tierAtLeast,
  type Feature,
  type Tier,
} from "../lib/tiers.js";

/**
 * Tier-based API guards. These intercept premium route targets and reject a
 * tenant whose subscription tier is below the threshold with a clean 403, the
 * server-side half of the gating matrix in lib/tiers.ts (the frontend
 * <FeatureGate> hides the same things, but THIS is the real boundary).
 *
 * Multi-tenant isolation is preserved exactly like every other guard: the tier
 * is resolved from the verified session's `tenantId` (never the body/params),
 * and read LIVE from the row so an upgrade/downgrade takes effect on the next
 * request rather than whenever the cookie is next minted.
 *
 * Compose these AFTER requireAuth/requireRole (which set `req.user`); they also
 * fall back to reading the session cookie directly so they're safe to mount
 * standalone.
 */

/**
 * How the guard learns a tenant's tier. Defaults to the live DB lookup; injected
 * in tests so the guard's decision logic can be exercised without a database.
 */
export type TierResolver = (tenantId: string) => Promise<Tier | null>;

function unauthorized(res: Response): void {
  res.status(401).json({ ok: false, error: "Not authenticated." });
}

/**
 * Guard: require the tenant's tier to meet or exceed `min`. On an insufficient
 * tier it answers 403 with the threshold so the client can route to an upgrade
 * prompt. A session with no tenant (the platform Super Admin) has no store to
 * gate and is refused — these are merchant-scoped premium routes.
 */
export function requireMinTier(min: Tier, resolveTier: TierResolver = tenantTierById) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = req.user ?? sessionFromRequest(req);
    if (!session) {
      unauthorized(res);
      return;
    }
    if (!session.tenantId) {
      res.status(403).json({
        ok: false,
        error: "No store is associated with this account.",
      });
      return;
    }
    try {
      const tier = await resolveTier(session.tenantId);
      if (!tier) {
        res.status(403).json({ ok: false, error: "No store is associated with this account." });
        return;
      }
      if (!tierAtLeast(tier, min)) {
        res.status(403).json({
          ok: false,
          error: `This feature is available on the ${TIER_LABEL[min]} plan and above. Upgrade to unlock it.`,
          requiredTier: min,
          currentTier: tier,
        });
        return;
      }
      // Ensure downstream handlers (mounted standalone) have the session.
      req.user = session;
      next();
    } catch (err) {
      // A plan lookup failure must not masquerade as a downgrade — be honest.
      console.error("[tier] could not resolve tenant tier:", err);
      res.status(500).json({ ok: false, error: "Could not verify your plan. Try again." });
    }
  };
}

/**
 * Guard: require the tenant's tier to be high enough for a named `feature`,
 * resolved through the central gating matrix. Sugar over requireMinTier so route
 * mounts read in feature terms — e.g. `requireFeature("custom_branding")` —
 * rather than restating which tier owns it.
 */
export function requireFeature(feature: Feature, resolveTier: TierResolver = tenantTierById) {
  return requireMinTier(minTierForFeature(feature), resolveTier);
}
