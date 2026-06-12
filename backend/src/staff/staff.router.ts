import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import {
  createCashier,
  deleteCashier,
  listCashierSummaries,
  listPendingPinRequests,
  rejectPinRequest,
  setCashierPin,
  updateCashier,
} from "./staff.repository.js";
import { forceCloseShiftForCashier } from "../pos/shifts.repository.js";

const MAX_FLOAT_CENTS = 100_000_00; // ₱100,000 — mirrors the shift open/close cap.

/** Validate an optional centavo amount: integer, 0..MAX_FLOAT_CENTS. */
function parseFloatCents(value: unknown): { ok: true; cents: number } | { ok: false } {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_FLOAT_CENTS) return { ok: false };
  return { ok: true, cents: n };
}

/**
 * Staff & cashier-PIN administration — OWNER ONLY. Cashiers can request a PIN
 * reset (see the public /auth/pin/forgot seam); only the store owner sets the
 * new PIN here. Tenant scope comes from the verified session, never the body.
 */
export const staffRouter = Router();

staffRouter.use(requireRole("MERCHANT_OWNER"));

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}
function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** GET /api/v1/staff/cashiers — cashiers with PIN + pending-request status. */
staffRouter.get("/cashiers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const [cashiers, requests] = await Promise.all([
      listCashierSummaries(tenantId),
      listPendingPinRequests(tenantId),
    ]);
    res.json({ ok: true, cashiers, requests });
  } catch (err) {
    console.error("[staff] list cashiers failed:", err);
    res.status(500).json({ ok: false, error: "Could not load staff." });
  }
});

/** POST /api/v1/staff/cashiers — owner adds a cashier (name + optional PIN). */
staffRouter.post("/cashiers", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const body = (req.body ?? {}) as { name?: unknown; pin?: unknown; defaultFloatCents?: unknown };
  const name = String(body.name ?? "").trim();
  if (name.length < 1 || name.length > 80) {
    return res.status(400).json({ ok: false, errors: { name: "Enter a name (1–80 characters)." } });
  }
  let pin: string | undefined;
  const rawPin = body.pin;
  if (rawPin !== undefined && rawPin !== null && String(rawPin).trim() !== "") {
    pin = String(rawPin).trim();
    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ ok: false, errors: { pin: "PIN must be exactly 4 digits." } });
    }
  }
  let defaultFloatCents = 0;
  if (body.defaultFloatCents !== undefined && body.defaultFloatCents !== null) {
    const f = parseFloatCents(body.defaultFloatCents);
    if (!f.ok) {
      return res.status(400).json({ ok: false, errors: { defaultFloatCents: "Enter a valid default float." } });
    }
    defaultFloatCents = f.cents;
  }
  try {
    const cashier = await createCashier(tenantId, name, pin, defaultFloatCents);
    res.status(201).json({ ok: true, cashier });
  } catch (err) {
    console.error("[staff] create cashier failed:", err);
    res.status(500).json({ ok: false, error: "Could not add the cashier." });
  }
});

/** PATCH /api/v1/staff/cashiers/:id — owner edits a cashier's name and/or status. */
staffRouter.patch("/cashiers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const body = (req.body ?? {}) as { name?: unknown; status?: unknown; defaultFloatCents?: unknown };
  const fields: { name?: string; status?: "active" | "disabled"; defaultFloatCents?: number } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 1 || name.length > 80) {
      return res.status(400).json({ ok: false, errors: { name: "Enter a name (1–80 characters)." } });
    }
    fields.name = name;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (status !== "active" && status !== "disabled") {
      return res.status(400).json({ ok: false, errors: { status: "Status must be active or disabled." } });
    }
    fields.status = status;
  }
  if (body.defaultFloatCents !== undefined) {
    const f = parseFloatCents(body.defaultFloatCents);
    if (!f.ok) {
      return res.status(400).json({ ok: false, errors: { defaultFloatCents: "Enter a valid default float." } });
    }
    fields.defaultFloatCents = f.cents;
  }
  if (fields.name === undefined && fields.status === undefined && fields.defaultFloatCents === undefined) {
    return res.status(400).json({ ok: false, error: "Nothing to update." });
  }
  try {
    const ok = await updateCashier(tenantId, req.params.id, fields);
    if (!ok) return res.status(404).json({ ok: false, error: "Cashier not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[staff] update cashier failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the cashier." });
  }
});

/** DELETE /api/v1/staff/cashiers/:id — owner removes a cashier profile. */
staffRouter.delete("/cashiers/:id", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await deleteCashier(tenantId, req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: "Cashier not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[staff] delete cashier failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove the cashier." });
  }
});

/**
 * POST /api/v1/staff/cashiers/:id/close-shift — owner force-closes (Z-Reads) a
 * cashier's open shift. Body: { countedCents?, note? }. Omitting countedCents
 * records the expected drawer (zero variance, "drawer not counted").
 */
staffRouter.post("/cashiers/:id/close-shift", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const body = (req.body ?? {}) as { countedCents?: unknown; note?: unknown };

  let countedCents: number | null = null;
  if (body.countedCents !== undefined && body.countedCents !== null) {
    const c = parseFloatCents(body.countedCents);
    if (!c.ok) {
      return res.status(400).json({ ok: false, errors: { countedCents: "Enter a valid counted amount." } });
    }
    countedCents = c.cents;
  }
  const note = body.note !== undefined && body.note !== null ? String(body.note).trim().slice(0, 280) : null;

  try {
    const result = await forceCloseShiftForCashier(
      tenantId,
      req.params.id,
      countedCents,
      note || null,
      req.user?.name ?? "Owner",
    );
    if (result.ok) return res.json({ ok: true, zread: result.zread });
    return res.status(409).json({ ok: false, error: "This cashier has no open shift." });
  } catch (err) {
    console.error("[staff] force-close shift failed:", err);
    res.status(500).json({ ok: false, error: "Could not close the shift." });
  }
});

/** POST /api/v1/staff/cashiers/:id/pin — owner sets a cashier's 4-digit PIN. */
staffRouter.post("/cashiers/:id/pin", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const pin = String((req.body as { pin?: unknown })?.pin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ ok: false, errors: { pin: "PIN must be exactly 4 digits." } });
  }
  try {
    const ok = await setCashierPin(tenantId, req.params.id, pin, req.user!.userId);
    if (!ok) return res.status(404).json({ ok: false, error: "Cashier not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[staff] set pin failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the PIN." });
  }
});

/** POST /api/v1/staff/pin-requests/:id/reject — dismiss a pending request. */
staffRouter.post("/pin-requests/:id/reject", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const ok = await rejectPinRequest(tenantId, req.params.id, req.user!.userId);
    if (!ok) return res.status(404).json({ ok: false, error: "Request not found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[staff] reject request failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the request." });
  }
});
