import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { customerCreateSchema, customerUpdateSchema } from "./crm.schema.js";
import {
  createCustomer,
  deleteCustomer,
  getCrmSummary,
  getCustomer,
  listCustomers,
  searchCustomers,
  updateCustomer,
} from "./crm.repository.js";

/**
 * Merchant CRM — customers + loyalty.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER / CASHIER): the first two
 * manage the customer book from the dashboard, while CASHIERs need read/search
 * + quick-add at the POS to attach a customer to a sale. Tenant scope comes only
 * from the verified session.
 */
export const crmRouter = Router();

crmRouter.use(requireRole("MERCHANT_OWNER", "MANAGER", "CASHIER"));

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

// ── Summary ──────────────────────────────────────────────────────────────────

crmRouter.get("/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, summary: await getCrmSummary(tenantId) });
  } catch (err) {
    console.error("[crm] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your CRM summary." });
  }
});

// ── Customers ────────────────────────────────────────────────────────────────

crmRouter.get("/customers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, customers: await listCustomers(tenantId) });
  } catch (err) {
    console.error("[crm] list customers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load customers." });
  }
});

/** POS picker: lightweight name/phone search. */
crmRouter.get("/customers/search", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (q.trim().length < 1) return res.json({ ok: true, customers: [] });
  try {
    res.json({ ok: true, customers: await searchCustomers(tenantId, q) });
  } catch (err) {
    console.error("[crm] search customers failed:", err);
    res.status(500).json({ ok: false, error: "Could not search customers." });
  }
});

crmRouter.get("/customers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const customer = await getCustomer(tenantId, req.params.id);
    if (!customer) return res.status(404).json({ ok: false, error: "Customer not found." });
    res.json({ ok: true, customer });
  } catch (err) {
    console.error("[crm] get customer failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the customer." });
  }
});

crmRouter.post("/customers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = customerCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    res.status(201).json({ ok: true, customer: await createCustomer(tenantId, parsed.data) });
  } catch (err) {
    console.error("[crm] create customer failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the customer." });
  }
});

crmRouter.patch("/customers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = customerUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const customer = await updateCustomer(tenantId, req.params.id, parsed.data);
    if (!customer) return res.status(404).json({ ok: false, error: "Customer not found." });
    res.json({ ok: true, customer });
  } catch (err) {
    console.error("[crm] update customer failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the customer." });
  }
});

crmRouter.delete("/customers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteCustomer(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Customer not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[crm] delete customer failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the customer." });
  }
});
