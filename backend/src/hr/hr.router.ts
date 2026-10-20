import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import {
  adoptCashierSchema,
  attendanceUpsertSchema,
  employeeCreateSchema,
  employeeUpdateSchema,
  dailyRateSchema,
  payrollAdjustmentSchema,
  payrollRunSchema,
  tillAccessSchema,
  timecardCorrectionSchema,
} from "./hr.schema.js";
import {
  clearManualAttendance,
  correctTimecard,
  getAttendanceReport,
  getTeamAttendance,
} from "./attendance.repository.js";
import { monthBounds } from "./hr.repository.js";
import { logActivity } from "../pos/audit.repository.js";
import {
  adoptCashier,
  createEmployee,
  deleteEmployee,
  getEmployee,
  getAttendanceForDate,
  getEmployeeDetail,
  getHrOverview,
  getHrSummary,
  getPerformance,
  grantTillAccess,
  listEmployees,
  listUnlinkedCashiers,
  updateEmployee,
  upsertAttendance,
  type AdoptResult,
  type GrantTillResult,
} from "./hr.repository.js";
import { DEFAULT_HOURLY_RATE_CENTS, getLaborAnalytics } from "./timecard.repository.js";
import {
  addAdjustment,
  approveRun,
  createDraftRun,
  deleteAdjustment,
  deleteDraftRun,
  getPayrollRun,
  listPayrollRuns,
  payrollCsv,
  recalculateRun,
  setAdjustmentApproved,
  setLineRate,
} from "./payroll.repository.js";

/**
 * Merchant HR — employees, attendance, payroll.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). Tenant scope comes only from
 * the verified session (`req.user.tenantId`).
 */
export const hrRouter = Router();

hrRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));
// HR / payroll is an ENTERPRISE-tier module — a STARTER or BUSINESS store is 403'd.
hrRouter.use(requireFeature("human_resources_payroll"));

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}

function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** Read & validate a YYYY-MM query param, defaulting to the current Manila month. */
const UUID = new RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "i");

function monthParam(req: Request): string {
  const m = req.query.month;
  return typeof m === "string" && ISO_MONTH.test(m) ? m : new Date().toISOString().slice(0, 7);
}

/** Read a YYYY-MM-DD query param if valid, else null. */
function dateParam(req: Request, key: string): string | null {
  const v = req.query[key];
  return typeof v === "string" && ISO_DATE.test(v) ? v : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve [from, to] from the query, defaulting to the trailing 30 days. */
function windowParams(req: Request): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from: dateParam(req, "from") ?? monthAgo, to: dateParam(req, "to") ?? today };
}


// ── Summary ──────────────────────────────────────────────────────────────────

hrRouter.get("/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, summary: await getHrSummary(tenantId) });
  } catch (err) {
    console.error("[hr] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your HR summary." });
  }
});

// ── Executive overview hub ─────────────────────────────────────────────────────

hrRouter.get("/overview", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, overview: await getHrOverview(tenantId) });
  } catch (err) {
    console.error("[hr] overview failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the HR overview." });
  }
});

// ── Performance matrix ─────────────────────────────────────────────────────────

hrRouter.get("/performance", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  // Default to the trailing 30 days when no explicit window is given.
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = dateParam(req, "from") ?? monthAgo;
  const to = dateParam(req, "to") ?? today;
  if (from > to) return res.status(400).json({ ok: false, error: "The 'from' date must be on or before 'to'." });
  try {
    res.json({ ok: true, report: await getPerformance(tenantId, from, to) });
  } catch (err) {
    console.error("[hr] performance failed:", err);
    res.status(500).json({ ok: false, error: "Could not load performance analytics." });
  }
});

// ── Labor analytics (shift-clock hours vs. sales) ──────────────────────────────

/** Read & clamp an optional ?rateCents= baseline hourly rate, else the default. */
function rateParam(req: Request): number {
  const raw = Number(req.query.rateCents);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_HOURLY_RATE_CENTS;
  // Cap at ₱100,000/hr so a fat-fingered value can't overflow the payroll log.
  return Math.min(Math.round(raw), 10_000_000);
}

hrRouter.get("/labor-analytics", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const from = dateParam(req, "from") ?? monthAgo;
  const to = dateParam(req, "to") ?? today;
  if (from > to) return res.status(400).json({ ok: false, error: "The 'from' date must be on or before 'to'." });
  try {
    res.json({ ok: true, analytics: await getLaborAnalytics(tenantId, from, to, rateParam(req)) });
  } catch (err) {
    console.error("[hr] labor analytics failed:", err);
    res.status(500).json({ ok: false, error: "Could not load labor analytics." });
  }
});

// ── Shift discrepancy matrix (drawer reconciliation audit) ─────────────────────

// ── Employees ────────────────────────────────────────────────────────────────

hrRouter.get("/employees", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, employees: await listEmployees(tenantId) });
  } catch (err) {
    console.error("[hr] list employees failed:", err);
    res.status(500).json({ ok: false, error: "Could not load employees." });
  }
});

hrRouter.get("/employees/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const detail = await getEmployeeDetail(tenantId, req.params.id, monthParam(req));
    if (!detail) return res.status(404).json({ ok: false, error: "Employee not found." });
    res.json({ ok: true, employee: detail });
  } catch (err) {
    console.error("[hr] employee detail failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the employee file." });
  }
});

hrRouter.post("/employees", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = employeeCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    res.status(201).json({ ok: true, employee: await createEmployee(tenantId, parsed.data) });
  } catch (err) {
    console.error("[hr] create employee failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the employee." });
  }
});

hrRouter.patch("/employees/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = employeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    // A manager can't raise their own pay: only the owner changes the salary
    // fields on the employee record linked to that manager's own login.
    const touchesPay = parsed.data.dailyRate !== undefined || parsed.data.payRate !== undefined || parsed.data.payType !== undefined;
    if (touchesPay && req.user?.role === "MANAGER") {
      const self = await getEmployee(tenantId, req.params.id);
      if (self?.userId && self.userId === req.user.userId) {
        return res.status(403).json({ ok: false, error: "You can't change your own pay. Ask the store owner." });
      }
    }
    const employee = await updateEmployee(tenantId, req.params.id, parsed.data);
    if (!employee) return res.status(404).json({ ok: false, error: "Employee not found." });
    res.json({ ok: true, employee });
  } catch (err) {
    console.error("[hr] update employee failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the employee." });
  }
});

hrRouter.delete("/employees/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteEmployee(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Employee not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[hr] delete employee failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the employee." });
  }
});

// ── Till access (Employee ↔ Cashier bridge) ───────────────────────────────────

/** Active cashier logins with no linked employee — the "link existing" options. */
hrRouter.get("/cashiers/unlinked", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, cashiers: await listUnlinkedCashiers(tenantId) });
  } catch (err) {
    console.error("[hr] list unlinked cashiers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load cashiers." });
  }
});

/** Maps a grant failure code to an HTTP status + user-facing message. */
const GRANT_ERRORS: Record<Exclude<GrantTillResult, { ok: true }>["code"], [number, string]> = {
  not_found: [404, "Employee not found."],
  inactive: [409, "This employee is separated — reactivate them before granting till access."],
  already_linked: [409, "This employee already has till access."],
  cashier_not_found: [404, "That cashier login no longer exists."],
  cashier_disabled: [409, "That cashier login is disabled — re-enable it first."],
  cashier_taken: [409, "That cashier is already linked to another employee."],
};

hrRouter.post("/employees/:id/till-access", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Employee not found." });
  const parsed = tillAccessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const result = await grantTillAccess(tenantId, req.params.id, parsed.data);
    if (result.ok) return res.json({ ok: true, cashier: result.cashier });
    const [status, error] = GRANT_ERRORS[result.code];
    res.status(status).json({ ok: false, error });
  } catch (err) {
    console.error("[hr] grant till access failed:", err);
    res.status(500).json({ ok: false, error: "Could not grant till access." });
  }
});

/** Maps an adopt failure code to an HTTP status + user-facing message. */
const ADOPT_ERRORS: Record<Exclude<AdoptResult, { ok: true }>["code"], [number, string]> = {
  cashier_not_found: [404, "That cashier login no longer exists."],
  cashier_disabled: [409, "That cashier login is disabled — re-enable it first."],
  already_adopted: [409, "That cashier is already linked to an employee."],
  employee_not_found: [404, "Employee not found."],
  employee_inactive: [409, "That employee is separated — reactivate them first."],
  employee_linked: [409, "That employee already has till access."],
};

hrRouter.post("/cashiers/:id/adopt", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Cashier not found." });
  const parsed = adoptCashierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const result = await adoptCashier(tenantId, req.params.id, parsed.data);
    if (result.ok) return res.json({ ok: true, employee: result.employee });
    const [status, error] = ADOPT_ERRORS[result.code];
    res.status(status).json({ ok: false, error });
  } catch (err) {
    console.error("[hr] adopt cashier failed:", err);
    res.status(500).json({ ok: false, error: "Could not adopt the cashier." });
  }
});

// ── Attendance ───────────────────────────────────────────────────────────────

hrRouter.get("/attendance", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const date = typeof req.query.date === "string" && ISO_DATE.test(req.query.date) ? req.query.date : null;
  if (!date) return res.status(400).json({ ok: false, error: "A valid ?date=YYYY-MM-DD is required." });
  try {
    res.json({ ok: true, date, attendance: await getAttendanceForDate(tenantId, date) });
  } catch (err) {
    console.error("[hr] attendance read failed:", err);
    res.status(500).json({ ok: false, error: "Could not load attendance." });
  }
});

hrRouter.put("/attendance", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = attendanceUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const ok = await upsertAttendance(tenantId, parsed.data);
    if (!ok) return res.status(404).json({ ok: false, error: "Employee not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[hr] attendance upsert failed:", err);
    res.status(500).json({ ok: false, error: "Could not save attendance." });
  }
});

/** GET /hr/attendance/month?month=YYYY-MM — every employee's month totals, for the Attendance tab. */
hrRouter.get("/attendance/month", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const { start, end } = monthBounds(monthParam(req));
    res.json({ ok: true, month: start.slice(0, 7), rows: await getTeamAttendance(tenantId, start, end) });
  } catch (err) {
    console.error("[hr] team attendance failed:", err);
    res.status(500).json({ ok: false, error: "Could not load attendance." });
  }
});

/** DELETE /hr/attendance?employeeId=&date= — drop a manual entry; the day goes back to the timecards. */
hrRouter.delete("/attendance", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const employeeId = typeof req.query.employeeId === "string" ? req.query.employeeId : "";
  const date = typeof req.query.date === "string" && ISO_DATE.test(req.query.date) ? req.query.date : null;
  if (!UUID.test(employeeId) || !date) {
    return res.status(400).json({ ok: false, error: "A valid employeeId and date are required." });
  }
  try {
    await clearManualAttendance(tenantId, employeeId, date);
    res.json({ ok: true });
  } catch (err) {
    console.error("[hr] attendance clear failed:", err);
    res.status(500).json({ ok: false, error: "Could not clear the entry." });
  }
});

/**
 * GET /hr/employees/:id/attendance?month=YYYY-MM — the month derived from the
 * employee's schedule + Shift In/Out timecards + manual entries: one status per
 * day (with Time In / Time Out, break and worked minutes) and the totals.
 */
hrRouter.get("/employees/:id/attendance", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID.test(req.params.id)) return res.status(404).json({ ok: false, error: "Employee not found." });
  try {
    const { start, end } = monthBounds(monthParam(req));
    const report = await getAttendanceReport(tenantId, req.params.id, start, end);
    if (!report) return res.status(404).json({ ok: false, error: "Employee not found." });
    res.json({ ok: true, month: start.slice(0, 7), ...report });
  } catch (err) {
    console.error("[hr] attendance report failed:", err);
    res.status(500).json({ ok: false, error: "Could not load attendance." });
  }
});

/**
 * PATCH /hr/timecards/:id — set a timecard's real Time In / Time Out (the fix
 * for a forgotten Shift Out). Owner/manager only, like the rest of this router;
 * tenant-fenced; recorded on the activity log with the before/after times.
 */
hrRouter.patch("/timecards/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID.test(req.params.id)) return res.status(404).json({ ok: false, error: "Timecard not found." });
  const parsed = timecardCorrectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const result = await correctTimecard(tenantId, req.params.id, parsed.data);
    if (!result.ok) {
      return result.code === "NOT_FOUND"
        ? res.status(404).json({ ok: false, error: "Timecard not found." })
        : res.status(400).json({ ok: false, error: result.detail });
    }
    const t = (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "open";
    void logActivity(
      { tenantId, userId: req.user?.userId ?? null, name: req.user?.name ?? "Manager" },
      {
        action: "timecard_corrected",
        refId: req.params.id,
        detail: `${t(result.before.clockIn)} – ${t(result.before.clockOut)} → ${t(result.after.clockIn)} – ${t(result.after.clockOut)}`,
      },
    );
    res.json({ ok: true, timecard: result.after });
  } catch (err) {
    console.error("[hr] timecard correction failed:", err);
    res.status(500).json({ ok: false, error: "Could not save the correction." });
  }
});

// ── Payroll ──────────────────────────────────────────────────────────────────
//
// Draft → Approved. Base earnings come from attendance (see hr/payroll.ts);
// overtime and paid leave are suggestions the manager approves; manual +/-
// adjustments are allowed. An approved run is locked. Owner/manager only (the
// router-level guard); a MANAGER can't touch or approve their own pay line.

function actorOf(req: Request) {
  return { userId: req.user?.userId ?? null, role: req.user?.role ?? "", name: req.user?.name ?? "Manager" };
}

function draftError(res: Response, code: "NOT_FOUND" | "NOT_DRAFT" | "OWN_PAY") {
  if (code === "NOT_FOUND") return res.status(404).json({ ok: false, error: "Payroll run not found." });
  if (code === "OWN_PAY") {
    return res.status(403).json({ ok: false, error: "You can't change or approve your own pay. Ask the store owner." });
  }
  return res.status(409).json({ ok: false, error: "This payroll run is approved and locked." });
}

hrRouter.get("/payroll", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, runs: await listPayrollRuns(tenantId) });
  } catch (err) {
    console.error("[hr] list payroll failed:", err);
    res.status(500).json({ ok: false, error: "Could not load payroll runs." });
  }
});

hrRouter.get("/payroll/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Payroll run not found." });
  try {
    const run = await getPayrollRun(tenantId, req.params.id);
    if (!run) return res.status(404).json({ ok: false, error: "Payroll run not found." });
    res.json({ ok: true, run });
  } catch (err) {
    console.error("[hr] get payroll failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the payroll run." });
  }
});

/** GET /hr/payroll/:id/csv — the final payable figures of an APPROVED run. */
hrRouter.get("/payroll/:id/csv", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Payroll run not found." });
  try {
    const run = await getPayrollRun(tenantId, req.params.id);
    if (!run) return res.status(404).json({ ok: false, error: "Payroll run not found." });
    if (run.status !== "approved") return res.status(409).json({ ok: false, error: "Approve the run before exporting it." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${run.reference}.csv"`);
    res.send(payrollCsv(run));
  } catch (err) {
    console.error("[hr] payroll csv failed:", err);
    res.status(500).json({ ok: false, error: "Could not export the payroll run." });
  }
});

/** POST /hr/payroll — start a DRAFT run for a period. */
hrRouter.post("/payroll", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = payrollRunSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const result = await createDraftRun(tenantId, req.user?.userId ?? null, parsed.data);
    if (!result.ok) {
      return result.code === "OVERLAP"
        ? res.status(409).json({ ok: false, error: `These dates overlap ${result.reference}. Pick a period that isn't paid yet.` })
        : res.status(400).json({ ok: false, error: "There are no employees to pay in this period." });
    }
    res.status(201).json({ ok: true, run: await getPayrollRun(tenantId, result.runId) });
  } catch (err) {
    console.error("[hr] create payroll failed:", err);
    res.status(500).json({ ok: false, error: "Could not start the payroll run." });
  }
});

/** POST /hr/payroll/:id/recalculate — re-read attendance (e.g. after fixing a Shift Out). */
hrRouter.post("/payroll/:id/recalculate", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Payroll run not found." });
  try {
    const r = await recalculateRun(tenantId, req.params.id, req.user?.userId ?? null);
    if (!r.ok) return draftError(res, r.code);
    res.json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll recalculate failed:", err);
    res.status(500).json({ ok: false, error: "Could not recalculate the run." });
  }
});

/** PUT /hr/payroll/:id/lines/:lineId/rate — enter or confirm the daily rate. */
hrRouter.put("/payroll/:id/lines/:lineId/rate", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.lineId)) {
    return res.status(404).json({ ok: false, error: "Payroll line not found." });
  }
  const parsed = dailyRateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const r = await setLineRate(tenantId, req.params.id, req.params.lineId, parsed.data.dailyRateCents, actorOf(req));
    if (!r.ok) return draftError(res, r.code);
    res.json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll rate failed:", err);
    res.status(500).json({ ok: false, error: "Could not save the daily rate." });
  }
});

/** POST /hr/payroll/:id/lines/:lineId/adjustments — a manual +/- line. */
hrRouter.post("/payroll/:id/lines/:lineId/adjustments", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.lineId)) {
    return res.status(404).json({ ok: false, error: "Payroll line not found." });
  }
  const parsed = payrollAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const r = await addAdjustment(tenantId, req.params.id, req.params.lineId, parsed.data, actorOf(req));
    if (!r.ok) return draftError(res, r.code);
    res.status(201).json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll adjustment failed:", err);
    res.status(500).json({ ok: false, error: "Could not add the adjustment." });
  }
});

/** PATCH /hr/payroll/:id/adjustments/:adjId — approve / un-approve (e.g. overtime). */
hrRouter.patch("/payroll/:id/adjustments/:adjId", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.adjId)) {
    return res.status(404).json({ ok: false, error: "Adjustment not found." });
  }
  const approved = (req.body as { approved?: unknown })?.approved;
  if (typeof approved !== "boolean") return res.status(400).json({ ok: false, error: "Send approved: true or false." });
  try {
    const r = await setAdjustmentApproved(tenantId, req.params.id, req.params.adjId, approved, actorOf(req));
    if (!r.ok) return draftError(res, r.code);
    res.json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll adjustment toggle failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the adjustment." });
  }
});

hrRouter.delete("/payroll/:id/adjustments/:adjId", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id) || !UUID_RE.test(req.params.adjId)) {
    return res.status(404).json({ ok: false, error: "Adjustment not found." });
  }
  try {
    const r = await deleteAdjustment(tenantId, req.params.id, req.params.adjId, actorOf(req));
    if (!r.ok) return draftError(res, r.code);
    res.json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll adjustment delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove the adjustment." });
  }
});

/** POST /hr/payroll/:id/approve — lock the run (all blockers re-checked here). */
hrRouter.post("/payroll/:id/approve", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Payroll run not found." });
  try {
    const actor = actorOf(req);
    const r = await approveRun(tenantId, req.params.id, actor);
    if (!r.ok) {
      if (r.code === "BLOCKED") return res.status(409).json({ ok: false, error: r.blockers.join(" "), blockers: r.blockers });
      return draftError(res, r.code);
    }
    void logActivity(
      { tenantId, userId: actor.userId, name: actor.name },
      {
        action: "payroll_approved",
        refId: req.params.id,
        valueCents: r.totalPayableCents,
        detail: `${r.reference} · ${r.headcount} employee${r.headcount === 1 ? "" : "s"}`,
      },
    );
    res.json({ ok: true, run: await getPayrollRun(tenantId, req.params.id) });
  } catch (err) {
    console.error("[hr] payroll approve failed:", err);
    res.status(500).json({ ok: false, error: "Could not approve the run." });
  }
});

/** DELETE /hr/payroll/:id — discard a DRAFT (approved runs can't be deleted). */
hrRouter.delete("/payroll/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ ok: false, error: "Payroll run not found." });
  try {
    const r = await deleteDraftRun(tenantId, req.params.id);
    if (!r.ok) return draftError(res, r.code);
    res.json({ ok: true });
  } catch (err) {
    console.error("[hr] payroll delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not discard the draft." });
  }
});
