import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { getAtRiskTenants } from "./adminRisk.repository.js";

/**
 * Super-Admin churn-risk watchlist, mounted at /api/v1/admin/at-risk. Read-only
 * and platform-wide — it sits above any single Tenant, so no merchant token can
 * reach it. SUPER_ADMIN only.
 */
export const adminRiskRouter = Router();

adminRiskRouter.use(requireRole("SUPER_ADMIN"));

/** GET /api/v1/admin/at-risk — stores needing attention, most urgent first. */
adminRiskRouter.get("/", async (_req, res) => {
  try {
    res.json({ ok: true, tenants: await getAtRiskTenants() });
  } catch (err) {
    console.error("[admin/at-risk] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the watchlist." });
  }
});
