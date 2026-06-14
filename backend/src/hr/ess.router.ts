import { Router, type Request } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { getEssProfile } from "./hr.repository.js";

/**
 * Employee Self-Service (ESS) — a worker's view of their OWN record: shift hours,
 * accrued PTO, and their paystub archive.
 *
 * Unlike the HR admin router (owner/manager only), ESS is open to any signed-in
 * user — a CASHIER on a shared terminal can see their own figures. The record is
 * resolved strictly from the verified session (`req.user.tenantId` +
 * `req.user.userId`), never a client-supplied id, so one employee can never read
 * another's. A user with no linked employee row (e.g. the owner, who isn't on the
 * roster) gets a clean 404.
 */
export const essRouter = Router();

essRouter.use(requireAuth);

const ISO_MONTH = /^\d{4}-\d{2}$/;

function monthParam(req: Request): string {
  const m = req.query.month;
  return typeof m === "string" && ISO_MONTH.test(m) ? m : new Date().toISOString().slice(0, 7);
}

essRouter.get("/me", async (req, res) => {
  const tenantId = req.user?.tenantId ?? null;
  const userId = req.user?.userId ?? null;
  if (!tenantId || !userId) {
    return res.status(404).json({ ok: false, error: "No employee record is linked to this account." });
  }
  try {
    const profile = await getEssProfile(tenantId, userId, monthParam(req));
    if (!profile) {
      return res.status(404).json({ ok: false, error: "No employee record is linked to this account." });
    }
    res.json({ ok: true, profile });
  } catch (err) {
    console.error("[ess] profile failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your self-service record." });
  }
});
