import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import {
  poCreateSchema,
  poStatusSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
} from "./procurement.schema.js";
import {
  createPurchaseOrder,
  createSupplier,
  deletePurchaseOrder,
  deleteSupplier,
  getProcurementSummary,
  getPurchaseOrder,
  getReorderSuggestions,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  setPurchaseOrderStatus,
  updateSupplier,
  type PoActionResult,
} from "./procurement.repository.js";

/**
 * Merchant Procurement — suppliers + purchase orders.
 *
 * Fenced to store staff (MERCHANT_OWNER / MANAGER). The tenant scope comes
 * exclusively from the verified session (`req.user.tenantId`) and is threaded
 * into every repository call, so the API surface itself enforces row isolation.
 */
export const procurementRouter = Router();

procurementRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));
// Procurement (suppliers + POs) is a BUSINESS-tier module — STARTER is 403'd.
procurementRouter.use(requireFeature("procurement_supply_chain"));

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

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/** Map a repository action result to an HTTP response. */
function sendAction(res: Response, result: PoActionResult) {
  if (result.ok) return res.json({ ok: true, po: result.po });
  switch (result.code) {
    case "NOT_FOUND":
      return res.status(404).json({ ok: false, error: "Purchase order not found." });
    case "ALREADY_RECEIVED":
      return res.status(409).json({ ok: false, error: "This purchase order has already been received." });
    case "CANCELLED":
      return res.status(409).json({ ok: false, error: "This purchase order was cancelled." });
    default:
      return res.status(409).json({ ok: false, error: "That status change isn't allowed." });
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

procurementRouter.get("/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, summary: await getProcurementSummary(tenantId) });
  } catch (err) {
    console.error("[procurement] summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your procurement summary." });
  }
});

// ── Reorder suggestions ─────────────────────────────────────────────────────

procurementRouter.get("/reorder-suggestions", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, suggestions: await getReorderSuggestions(tenantId) });
  } catch (err) {
    console.error("[procurement] reorder suggestions failed:", err);
    res.status(500).json({ ok: false, error: "Could not compute reorder suggestions." });
  }
});

// ── Suppliers ────────────────────────────────────────────────────────────────

procurementRouter.get("/suppliers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, suppliers: await listSuppliers(tenantId) });
  } catch (err) {
    console.error("[procurement] list suppliers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load suppliers." });
  }
});

procurementRouter.post("/suppliers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = supplierCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    res.status(201).json({ ok: true, supplier: await createSupplier(tenantId, parsed.data) });
  } catch (err) {
    console.error("[procurement] create supplier failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the supplier." });
  }
});

procurementRouter.patch("/suppliers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = supplierUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const supplier = await updateSupplier(tenantId, req.params.id, parsed.data);
    if (!supplier) return res.status(404).json({ ok: false, error: "Supplier not found." });
    res.json({ ok: true, supplier });
  } catch (err) {
    console.error("[procurement] update supplier failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the supplier." });
  }
});

procurementRouter.delete("/suppliers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteSupplier(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Supplier not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[procurement] delete supplier failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the supplier." });
  }
});

// ── Purchase orders ──────────────────────────────────────────────────────────

procurementRouter.get("/purchase-orders", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, purchaseOrders: await listPurchaseOrders(tenantId) });
  } catch (err) {
    console.error("[procurement] list POs failed:", err);
    res.status(500).json({ ok: false, error: "Could not load purchase orders." });
  }
});

procurementRouter.get("/purchase-orders/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const po = await getPurchaseOrder(tenantId, req.params.id);
    if (!po) return res.status(404).json({ ok: false, error: "Purchase order not found." });
    res.json({ ok: true, po });
  } catch (err) {
    console.error("[procurement] get PO failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the purchase order." });
  }
});

procurementRouter.post("/purchase-orders", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = poCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const po = await createPurchaseOrder(tenantId, req.user?.userId ?? null, parsed.data);
    res.status(201).json({ ok: true, po });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ ok: false, error: "That purchase-order number is already in use." });
    }
    console.error("[procurement] create PO failed:", err);
    res.status(500).json({ ok: false, error: "Could not create the purchase order." });
  }
});

procurementRouter.post("/purchase-orders/:id/receive", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    sendAction(res, await receivePurchaseOrder(tenantId, req.params.id));
  } catch (err) {
    console.error("[procurement] receive PO failed:", err);
    res.status(500).json({ ok: false, error: "Could not receive the purchase order." });
  }
});

procurementRouter.patch("/purchase-orders/:id/status", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = poStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    sendAction(res, await setPurchaseOrderStatus(tenantId, req.params.id, parsed.data.status));
  } catch (err) {
    console.error("[procurement] update PO status failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the purchase order." });
  }
});

procurementRouter.delete("/purchase-orders/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const outcome = await deletePurchaseOrder(tenantId, req.params.id);
    if (outcome === "not_found") return res.status(404).json({ ok: false, error: "Purchase order not found." });
    if (outcome === "received") {
      return res.status(409).json({
        ok: false,
        error: "A received purchase order is kept as a stock-in record and can't be deleted.",
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[procurement] delete PO failed:", err);
    res.status(500).json({ ok: false, error: "Could not delete the purchase order." });
  }
});
