import { Router, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { orderSchema, shiftCloseSchema, shiftOpenSchema } from "./pos.schema.js";
import { returnSchema, voidSchema } from "./refunds.schema.js";
import { createOrder, getCatalog, listCashiers } from "./pos.repository.js";
import {
  getSaleDetail,
  listRecentSales,
  reverseSale,
  type ReverseMode,
  type ReverseResult,
} from "./refunds.repository.js";
import {
  closeShift,
  getActiveShift,
  getActiveShiftId,
  openShift,
} from "./shifts.repository.js";
import { getDefaultFloatCents } from "../staff/staff.repository.js";
import { formatPeso } from "../money.js";

/**
 * POS register API. Mounted at /api/v1/pos, open to the staff who work a till:
 * CASHIER, MERCHANT_OWNER, MANAGER. Tenant scope is taken from the verified
 * session (req.user.tenantId) — never the request body.
 */
export const posRouter = Router();

posRouter.use(requireRole("CASHIER", "MERCHANT_OWNER", "MANAGER"));

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

/** GET /api/v1/pos/catalog — the live, tenant-scoped register feed. */
posRouter.get("/catalog", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, ...(await getCatalog(tenantId)) });
  } catch (err) {
    console.error("[pos] catalog failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the catalog." });
  }
});

/** GET /api/v1/pos/cashiers — active cashier profiles for the switch selector. */
posRouter.get("/cashiers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, cashiers: await listCashiers(tenantId) });
  } catch (err) {
    console.error("[pos] cashiers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load cashiers." });
  }
});

/** POST /api/v1/pos/orders — atomic checkout: validate → decrement → log sale. */
posRouter.post("/orders", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  }

  try {
    const userId = req.user?.userId ?? null;
    // A CASHIER must ring up inside an open shift, so every peso is attributed to
    // a drawer that gets reconciled at Z-Read. Owners/managers aren't operating a
    // reconciled till, so they may sell without a shift (the sale's shift_id is
    // simply null).
    const shiftId = await getActiveShiftId(tenantId, userId);
    if (!shiftId && req.user?.role === "CASHIER") {
      return res
        .status(409)
        .json({ ok: false, code: "SHIFT_REQUIRED", error: "Open a shift before ringing up a sale." });
    }
    const result = await createOrder(tenantId, userId, parsed.data, shiftId);
    if (result.ok) {
      return res.status(201).json({ ok: true, sale: result.sale });
    }
    switch (result.error.code) {
      case "UNAVAILABLE":
        return res.status(400).json({
          ok: false,
          error: "An item is no longer available. Refresh the catalog.",
          productId: result.error.productId,
        });
      case "OUT_OF_STOCK":
        return res.status(400).json({
          ok: false,
          error:
            result.error.available > 0
              ? `Only ${result.error.available} of “${result.error.name}” left in stock.`
              : `“${result.error.name}” is out of stock.`,
          productId: result.error.productId,
          available: result.error.available,
        });
      case "INSUFFICIENT_CASH":
        return res.status(400).json({
          ok: false,
          error: `Cash tendered is less than the ${formatPeso(result.error.totalCents)} total.`,
        });
    }
  } catch (err) {
    console.error("[pos] order failed:", err);
    return res.status(500).json({ ok: false, error: "Checkout failed. Nothing was charged." });
  }
});

// ── Void / Return ────────────────────────────────────────────────────────────

/** GET /api/v1/pos/sales — recent sales for the void/return picker. */
posRouter.get("/sales", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const limit = Number(req.query.limit) || 50;
    res.json({ ok: true, sales: await listRecentSales(tenantId, limit) });
  } catch (err) {
    console.error("[pos] list sales failed:", err);
    res.status(500).json({ ok: false, error: "Could not load recent sales." });
  }
});

/** GET /api/v1/pos/sales/:id — one sale with per-line returnable quantities. */
posRouter.get("/sales/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const sale = await getSaleDetail(tenantId, req.params.id);
    if (!sale) return res.status(404).json({ ok: false, error: "Sale not found." });
    res.json({ ok: true, sale });
  } catch (err) {
    console.error("[pos] sale detail failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the sale." });
  }
});

/** Map a reversal failure to an HTTP response (shared by void + return). */
function reversalError(res: Response, result: Extract<ReverseResult, { ok: false }>) {
  const status = result.code === "NOT_FOUND" ? 404 : 409;
  return res.status(status).json({ ok: false, code: result.code, error: result.detail ?? reversalMessage(result.code) });
}
function reversalMessage(code: Extract<ReverseResult, { ok: false }>["code"]): string {
  switch (code) {
    case "NOT_FOUND":
      return "Sale not found.";
    case "NOT_REVERSIBLE":
      return "This sale can no longer be reversed.";
    case "NOTHING_TO_RETURN":
      return "There is nothing left to return on this sale.";
    case "INVALID_LINE":
      return "One of the selected lines is not on this sale.";
    case "OVER_RETURN":
      return "You can't return more than was sold.";
  }
}

/**
 * A reversal settles against the drawer it's processed in. A CASHIER must
 * therefore have an open shift (same rule as ringing a sale); an owner/manager
 * acting off-till reverses with shift_id null.
 */
async function resolveReversalShift(req: Request, tenantId: string): Promise<{ shiftId: string | null } | { blocked: true }> {
  const userId = req.user?.userId ?? null;
  const shiftId = await getActiveShiftId(tenantId, userId);
  if (!shiftId && req.user?.role === "CASHIER") return { blocked: true };
  return { shiftId };
}

/** POST /api/v1/pos/sales/:id/void — cancel a whole sale (full reversal). */
posRouter.post("/sales/:id/void", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const shift = await resolveReversalShift(req, tenantId);
    if ("blocked" in shift) {
      return res.status(409).json({ ok: false, code: "SHIFT_REQUIRED", error: "Open a shift before voiding a sale." });
    }
    const result = await reverseSale(
      tenantId,
      req.user?.userId ?? null,
      req.params.id,
      { kind: "void" },
      parsed.data.reason ?? null,
      shift.shiftId,
    );
    if (!result.ok) return reversalError(res, result);
    res.status(201).json({ ok: true, reversal: result.reversal });
  } catch (err) {
    console.error("[pos] void failed:", err);
    res.status(500).json({ ok: false, error: "Could not void the sale. Nothing was changed." });
  }
});

/** POST /api/v1/pos/sales/:id/returns — return specific lines (partial or full). */
posRouter.post("/sales/:id/returns", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  try {
    const shift = await resolveReversalShift(req, tenantId);
    if ("blocked" in shift) {
      return res.status(409).json({ ok: false, code: "SHIFT_REQUIRED", error: "Open a shift before processing a return." });
    }
    const mode: ReverseMode = { kind: "return", lines: parsed.data.lines };
    const result = await reverseSale(
      tenantId,
      req.user?.userId ?? null,
      req.params.id,
      mode,
      parsed.data.reason ?? null,
      shift.shiftId,
    );
    if (!result.ok) return reversalError(res, result);
    res.status(201).json({ ok: true, reversal: result.reversal });
  } catch (err) {
    console.error("[pos] return failed:", err);
    res.status(500).json({ ok: false, error: "Could not process the return. Nothing was changed." });
  }
});

// ── Shift reconciliation (X-Read / Z-Read) ──────────────────────────────────

/** GET /api/v1/pos/shifts/active — the caller's open shift + live tallies, or null. */
posRouter.get("/shifts/active", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const userId = req.user?.userId;
  if (!userId) return noTenant(res);
  try {
    const [shift, defaultFloatCents] = await Promise.all([
      getActiveShift(tenantId, userId),
      getDefaultFloatCents(tenantId, userId),
    ]);
    res.json({ ok: true, shift, defaultFloatCents });
  } catch (err) {
    console.error("[pos] active shift failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the shift." });
  }
});

/** POST /api/v1/pos/shifts/open — open a shift with the opening drawer float. */
posRouter.post("/shifts/open", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const userId = req.user?.userId;
  if (!userId) return noTenant(res);

  const parsed = shiftOpenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });

  try {
    const result = await openShift(tenantId, userId, req.user?.name ?? "Cashier", parsed.data.openingCents);
    if (result.ok) return res.status(201).json({ ok: true, shift: result.shift });
    return res.status(409).json({ ok: false, error: "A shift is already open on this account." });
  } catch (err) {
    console.error("[pos] open shift failed:", err);
    res.status(500).json({ ok: false, error: "Could not open the shift." });
  }
});

/** POST /api/v1/pos/shifts/close — Z-Read: reconcile + freeze the open shift. */
posRouter.post("/shifts/close", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const userId = req.user?.userId;
  if (!userId) return noTenant(res);

  const parsed = shiftCloseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });

  try {
    const result = await closeShift(tenantId, userId, parsed.data.countedCents, parsed.data.note ?? null);
    if (result.ok) return res.json({ ok: true, zread: result.zread });
    return res.status(409).json({ ok: false, error: "No open shift to close." });
  } catch (err) {
    console.error("[pos] close shift failed:", err);
    res.status(500).json({ ok: false, error: "Could not close the shift." });
  }
});
