import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { listAudit } from "./adminAudit.repository.js";
import { parsePaging } from "../lib/paging.js";

/**
 * Super-Admin audit trail read API, mounted at /api/v1/admin/audit. The ledger
 * of privileged control-plane actions (plan/status changes, broadcasts, profile
 * edits). Read-only here — writes happen inline at each action's own seam via
 * recordAudit. SUPER_ADMIN only.
 */
export const adminAuditRouter = Router();

adminAuditRouter.use(requireRole("SUPER_ADMIN"));

/** GET /api/v1/admin/audit — the most recent privileged actions, newest first. */
adminAuditRouter.get("/", async (req, res) => {
  try {
    const paging = parsePaging(req.query);
    const page = await listAudit(paging);
    res.json({ ok: true, entries: page.items, total: page.total, page: paging.page, pageSize: paging.pageSize });
  } catch (err) {
    console.error("[admin/audit] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the audit trail." });
  }
});
