import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { getBillingAnalytics, getSubscribers } from "./billing.repository.js";

/**
 * Super Admin billing analytics. Mounted at /api/v1/admin/analytics and fenced
 * to SUPER_ADMIN — these are platform-wide figures (MRR, subscribers, fee
 * trend) that sit above any single Tenant, so no merchant token can read them.
 */
export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.use(requireRole("SUPER_ADMIN"));

/** GET /api/v1/admin/analytics/billing — MRR engine + transaction-fee trend. */
adminAnalyticsRouter.get("/billing", async (_req, res) => {
  try {
    res.json({ ok: true, analytics: await getBillingAnalytics() });
  } catch (err) {
    console.error("[admin/analytics] billing failed:", err);
    res.status(500).json({ ok: false, error: "Could not load billing analytics." });
  }
});

/** GET /api/v1/admin/analytics/subscribers — the live subscriber directory. */
adminAnalyticsRouter.get("/subscribers", async (_req, res) => {
  try {
    res.json({ ok: true, subscribers: await getSubscribers() });
  } catch (err) {
    console.error("[admin/analytics] subscribers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load subscribers." });
  }
});
