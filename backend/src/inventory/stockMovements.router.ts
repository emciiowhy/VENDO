import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { parsePaging } from "../lib/paging.js";
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
    const paging = parsePaging(req.query);
    const page = await listProductMovements(tenantId, req.params.id, paging);
    res.json({ ok: true, movements: page.items, total: page.total, page: paging.page, pageSize: paging.pageSize });
  } catch (err) {
    console.error("[inventory] product movements failed:", err);
    res.status(500).json({ ok: false, error: "Could not load stock history." });
  }
});

/**
 * The Stock history page's filter groups. Retired modules (procurement,
 * manufacturing) stay as groups so their past rows remain findable.
 */
const TYPE_GROUPS: Record<string, StockReason[]> = {
  sales: ["sale"],
  reversals: ["sale_void", "return"],
  manual: ["adjust", "count"],
  received: ["po_receive"],
  production: ["produce_consume", "produce_output"],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Whole-store feed — powers Product Management → Stock history. Optional
 * filters: `?type=` (a group above) or `?reason=` (one raw reason),
 * `?productId=`, `?from=` / `?to=` (Manila dates, inclusive). Invalid values
 * are ignored rather than rejected.
 */
stockMovementsRouter.get("/movements", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const type = str(req.query.type);
  const reason = str(req.query.reason);
  const reasons =
    type && TYPE_GROUPS[type]
      ? TYPE_GROUPS[type]
      : REASONS.includes(reason as StockReason)
        ? [reason as StockReason]
        : undefined;
  const productId = str(req.query.productId);
  const from = str(req.query.from);
  const to = str(req.query.to);
  try {
    const paging = parsePaging(req.query);
    const page = await listMovements(
      tenantId,
      {
        reasons,
        productId: productId && UUID.test(productId) ? productId : undefined,
        from: from && ISO_DATE.test(from) ? from : undefined,
        to: to && ISO_DATE.test(to) ? to : undefined,
      },
      paging,
    );
    res.json({
      ok: true,
      movements: page.items,
      total: page.total,
      unitsIn: page.unitsIn,
      unitsOut: page.unitsOut,
      page: paging.page,
      pageSize: paging.pageSize,
    });
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
