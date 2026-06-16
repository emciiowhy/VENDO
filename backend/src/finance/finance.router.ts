import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import { expenseCreateSchema, expenseUpdateSchema } from "./finance.schema.js";
import {
  createExpense,
  deleteExpense,
  getBalanceSheet,
  getCashFlow,
  getFinanceSummary,
  listExpenses,
  updateExpense,
} from "./finance.repository.js";

/**
 * Merchant Finance — operating expenses + P&L.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). The tenant scope comes
 * exclusively from the verified session (`req.user.tenantId`) and is threaded
 * into every repository call, so the API surface itself enforces row isolation.
 */
export const financeRouter = Router();

financeRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));
// Finance / accounting is a BUSINESS-tier module — STARTER is 403'd.
financeRouter.use(requireFeature("finance_accounting"));

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
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

// ── P&L summary ──────────────────────────────────────────────────────────────

financeRouter.get("/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const months = Number(req.query.months);
  try {
    const summary = await getFinanceSummary(
      tenantId,
      Number.isInteger(months) ? months : 6,
    );
    res.json({ ok: true, summary });
  } catch (err) {
    console.error("[finance] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your finance summary." });
  }
});

// ── Balance sheet ────────────────────────────────────────────────────────────

financeRouter.get("/balance-sheet", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, balanceSheet: await getBalanceSheet(tenantId) });
  } catch (err) {
    console.error("[finance] balance sheet failed:", err);
    res.status(500).json({ ok: false, error: "Could not compile the balance sheet." });
  }
});

// ── Cash flow ────────────────────────────────────────────────────────────────

const MONTH = /^\d{4}-\d{2}$/;

financeRouter.get("/cash-flow", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const month = typeof req.query.month === "string" && MONTH.test(req.query.month) ? req.query.month : undefined;
  try {
    res.json({ ok: true, cashFlow: await getCashFlow(tenantId, month) });
  } catch (err) {
    console.error("[finance] cash flow failed:", err);
    res.status(500).json({ ok: false, error: "Could not compile the cash-flow statement." });
  }
});

// ── Expenses ─────────────────────────────────────────────────────────────────

financeRouter.get("/expenses", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const from = typeof req.query.from === "string" && ISO_DATE.test(req.query.from) ? req.query.from : undefined;
  const to = typeof req.query.to === "string" && ISO_DATE.test(req.query.to) ? req.query.to : undefined;
  try {
    res.json({ ok: true, expenses: await listExpenses(tenantId, { from, to }) });
  } catch (err) {
    console.error("[finance] list expenses failed:", err);
    res.status(500).json({ ok: false, error: "Could not load expenses." });
  }
});

financeRouter.post("/expenses", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = expenseCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const expense = await createExpense(tenantId, parsed.data, req.user?.userId ?? null);
    res.status(201).json({ ok: true, expense });
  } catch (err) {
    console.error("[finance] create expense failed:", err);
    res.status(500).json({ ok: false, error: "Could not record the expense." });
  }
});

financeRouter.patch("/expenses/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = expenseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const expense = await updateExpense(tenantId, req.params.id, parsed.data);
    if (!expense) return res.status(404).json({ ok: false, error: "Expense not found." });
    res.json({ ok: true, expense });
  } catch (err) {
    console.error("[finance] update expense failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the expense." });
  }
});

financeRouter.delete("/expenses/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteExpense(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Expense not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[finance] delete expense failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the expense." });
  }
});
