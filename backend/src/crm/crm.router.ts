import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import { getPricingSettings } from "../pos/pos.repository.js";
import { customerCreateSchema, customerUpdateSchema, discountSettingsSchema } from "./crm.schema.js";
import {
  createCustomer,
  deleteCustomer,
  getCrmSummary,
  getCustomer,
  listCustomers,
  searchCustomers,
  updateCustomer,
  updateDiscountSettings,
} from "./crm.repository.js";

// Changing the customer book or the discount rules is back-office work; a
// CASHIER may search, view and quick-add, but never edit, delete or re-price.
const managersOnly = requireRole("MERCHANT_OWNER", "MANAGER");

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
// CRM (customers + loyalty) is a BUSINESS-tier module — a STARTER store is 403'd
// off the entire surface (dashboard book AND the POS quick-add) per the matrix.
crmRouter.use(requireFeature("customer_relationship_crm"));

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

crmRouter.patch("/customers/:id", managersOnly, async (req, res) => {
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

crmRouter.delete("/customers/:id", managersOnly, async (req, res) => {
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

// ── Discounts ────────────────────────────────────────────────────────────────

/** GET /api/v1/crm/discount-settings — the loyalty rules (any store staff). */
crmRouter.get("/discount-settings", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, settings: await getPricingSettings(tenantId) });
  } catch (err) {
    console.error("[crm] discount settings failed:", err);
    res.status(500).json({ ok: false, error: "Could not load discount settings." });
  }
});

/** PUT /api/v1/crm/discount-settings — owner/manager only; cashiers get 403. */
crmRouter.put("/discount-settings", managersOnly, async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = discountSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  }
  try {
    await updateDiscountSettings(tenantId, parsed.data);
    res.json({ ok: true, settings: await getPricingSettings(tenantId) });
  } catch (err) {
    console.error("[crm] save discount settings failed:", err);
    res.status(500).json({ ok: false, error: "Could not save discount settings." });
  }
});
