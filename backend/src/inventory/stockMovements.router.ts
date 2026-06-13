import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import {
  findLedgerDrift,
  listMovements,
  listProductMovements,
  type StockReason,
} from "./stockLedger.js";

/**
 * Read access to the stock-movement ledger — the audit trail behind every
 * product's on-hand. Fenced to store staff (MERCHANT_OWNER / MANAGER); the
 * tenant scope comes only from the verified session, never the request.
 */
export const stockMovementsRouter = Router();

stockMovementsRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}
function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

const REASONS: readonly StockReason[] = [
  "sale",
  "sale_void",
  "return",
  "po_receive",
  "produce_consume",
  "produce_output",
  "adjust",
  "count",
];

/** Per-product history — powers the inventory "Stock history" drawer. */
stockMovementsRouter.get("/products/:id/movements", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const movements = await listProductMovements(tenantId, req.params.id);
    res.json({ ok: true, movements });
  } catch (err) {
    console.error("[inventory] product movements failed:", err);
    res.status(500).json({ ok: false, error: "Could not load stock history." });
  }
});

/** Whole-store feed, optionally `?reason=`. */
stockMovementsRouter.get("/movements", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const raw = typeof req.query.reason === "string" ? req.query.reason : undefined;
  const reason = REASONS.includes(raw as StockReason) ? (raw as StockReason) : undefined;
  try {
    const movements = await listMovements(tenantId, { reason });
    res.json({ ok: true, movements });
  } catch (err) {
    console.error("[inventory] movements feed failed:", err);
    res.status(500).json({ ok: false, error: "Could not load stock movements." });
  }
});

/** Integrity probe: products whose cached on-hand drifts from the ledger sum. */
stockMovementsRouter.get("/ledger-drift", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const drift = await findLedgerDrift(tenantId);
    res.json({ ok: true, drift });
  } catch (err) {
    console.error("[inventory] ledger drift check failed:", err);
    res.status(500).json({ ok: false, error: "Could not run the ledger integrity check." });
  }
});
