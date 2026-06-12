import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
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
  getEmployee,
  getHrSummary,
  getPayrollRun,
  listEmployees,
  listPayrollRuns,
  updateEmployee,
  upsertAttendance,
} from "./hr.repository.js";

/**
 * Merchant HR — employees, attendance, payroll.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). Tenant scope comes only from
 * the verified session (`req.user.tenantId`).
 */
export const hrRouter = Router();

hrRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

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
