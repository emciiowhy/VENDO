import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { resolveMonth } from "../merchant/compliance.csv.js";
import { getPlatformComplianceSummary } from "./adminCompliance.repository.js";
import { toPlatformCsv } from "./adminCompliance.csv.js";

/**
 * Super Admin platform compliance oversight. Mounted at /api/v1/admin/compliance
 * and fenced to SUPER_ADMIN — these are platform-wide tax figures across every
 * Tenant, so no merchant token can read them. The month window is resolved with
 * the same helper the merchant tray uses, so both views agree on filing periods.
 */
export const adminComplianceRouter = Router();

adminComplianceRouter.use(requireRole("SUPER_ADMIN"));

/** GET /api/v1/admin/compliance/summary?month=YYYY-MM — per-Tenant VAT rollup. */
adminComplianceRouter.get("/summary", async (req, res) => {
  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    const window = resolveMonth(month);
    const summary = await getPlatformComplianceSummary(window.periodStart, window.periodEnd);
    res.json({ ok: true, label: window.label, summary });
  } catch (err) {
    console.error("[admin/compliance] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not compile the compliance summary." });
  }
});

/** GET /api/v1/admin/compliance/export?month=YYYY-MM — consolidated CSV. */
adminComplianceRouter.get("/export", async (req, res) => {
  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    const window = resolveMonth(month);
    const summary = await getPlatformComplianceSummary(window.periodStart, window.periodEnd);
    const filename = `vendopos-platform-vat-${window.periodStart.slice(0, 7)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(toPlatformCsv(summary));
  } catch (err) {
    console.error("[admin/compliance] export failed:", err);
    res.status(500).json({ ok: false, error: "Could not compile the compliance export." });
  }
});
