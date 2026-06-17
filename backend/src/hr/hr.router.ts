import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import {
  attendanceUpsertSchema,
  employeeCreateSchema,
  employeeUpdateSchema,
  payrollRunSchema,
} from "./hr.schema.js";
import {
  createEmployee,
  createPayrollRun,
  deleteEmployee,
  getAttendanceForDate,
  getEmployeeDetail,
  getHrOverview,
  getHrSummary,
  getPayrollRun,
  getPerformance,
  listEmployees,
  listPayrollRuns,
  updateEmployee,
  upsertAttendance,
} from "./hr.repository.js";
import { DEFAULT_HOURLY_RATE_CENTS, getLaborAnalytics } from "./timecard.repository.js";
import { buildPayrollExport } from "./payroll.export.repository.js";
import { toPayrollCsv } from "./payroll.processor.js";
import { listShiftReconciliations } from "../pos/shifts.repository.js";

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

/** Truthy `?nightDiff=` query flag (1/true/yes/on). Defaults ON when absent. */
function nightDiffParam(req: Request): boolean {
  const v = req.query.nightDiff;
  if (v === undefined) return true;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
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

/**
 * GET /api/v1/hr/shift-reconciliations?from&to — every closed cashier shift in
 * the window with its drawer variance + short/over status, for the manager audit
 * matrix. Reuses the cashier_shifts ledger the POS close paths already write;
 * read-only and tenant-fenced (OWNER/MANAGER via the router-level guards).
 */
hrRouter.get("/shift-reconciliations", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const { from, to } = windowParams(req);
  if (from > to) return res.status(400).json({ ok: false, error: "The 'from' date must be on or before 'to'." });
  try {
    res.json({ ok: true, report: await listShiftReconciliations(tenantId, from, to) });
  } catch (err) {
    console.error("[hr] shift reconciliations failed:", err);
    res.status(500).json({ ok: false, error: "Could not load shift reconciliations." });
  }
});

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

// ── Payroll ──────────────────────────────────────────────────────────────────

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

/**
 * GET /api/v1/hr/payroll/export/preview?from&to&nightDiff&employeeId — the live
 * payroll table the export studio renders before download. Same maths as the CSV
 * route; returns JSON. Registered before `/payroll/:id` so "export" isn't read as
 * a run id.
 */
hrRouter.get("/payroll/export/preview", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const { from, to } = windowParams(req);
  if (from > to) return res.status(400).json({ ok: false, error: "The 'from' date must be on or before 'to'." });
  const employeeId = typeof req.query.employeeId === "string" && UUID_RE.test(req.query.employeeId)
    ? req.query.employeeId
    : undefined;
  try {
    const report = await buildPayrollExport(tenantId, from, to, nightDiffParam(req), employeeId);
    res.json({ ok: true, report });
  } catch (err) {
    console.error("[hr] payroll export preview failed:", err);
    res.status(500).json({ ok: false, error: "Could not build the payroll preview." });
  }
});

/**
 * GET /api/v1/hr/payroll/export?from&to&nightDiff&employeeId — the accounting-
 * ready payroll snapshot as a downloadable CSV stream. Strictly tenant-fenced;
 * a manager can never pull another store's labour. Registered before
 * `/payroll/:id` for the same routing reason as the preview above.
 */
hrRouter.get("/payroll/export", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const { from, to } = windowParams(req);
  if (from > to) return res.status(400).json({ ok: false, error: "The 'from' date must be on or before 'to'." });
  const employeeId = typeof req.query.employeeId === "string" && UUID_RE.test(req.query.employeeId)
    ? req.query.employeeId
    : undefined;
  try {
    const report = await buildPayrollExport(tenantId, from, to, nightDiffParam(req), employeeId);
    const csv = toPayrollCsv(report);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-${from}_to_${to}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[hr] payroll export failed:", err);
    res.status(500).json({ ok: false, error: "Could not export payroll." });
  }
});

hrRouter.get("/payroll/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const run = await getPayrollRun(tenantId, req.params.id);
    if (!run) return res.status(404).json({ ok: false, error: "Payroll run not found." });
    res.json({ ok: true, run });
  } catch (err) {
    console.error("[hr] get payroll failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the payroll run." });
  }
});

hrRouter.post("/payroll", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = payrollRunSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const run = await createPayrollRun(tenantId, req.user?.userId ?? null, parsed.data);
    res.status(201).json({ ok: true, run });
  } catch (err) {
    console.error("[hr] create payroll failed:", err);
    res.status(500).json({ ok: false, error: "Could not run payroll." });
  }
});
