import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { requireFeature } from "../auth/tier.middleware.js";
import {
  getComplianceLedger,
  getDashboardPulse,
  getLowStockCrossingsSince,
  getOwnerSummary,
  getReorderForecast,
  getStockAlerts,
} from "./merchant.repository.js";
import { DEFAULT_FORECAST_OPTIONS, type ForecastOptions } from "./forecast.js";
import { resolveMonth, toCsv } from "./compliance.csv.js";

/**
 * Merchant-side analytics + BIR compliance. Mounted at /api/v1/merchant and
 * fenced to store management (MERCHANT_OWNER / MANAGER). The tenant scope comes
 * exclusively from the verified session (`req.user.tenantId`) and is threaded
 * into every query — never read from the body or params.
 *
 * The low-stock alert engine is additionally exposed at /api/v1/inventory/alerts
 * (see app.ts) to read naturally as an inventory utility; both paths share the
 * same handler.
 */
export const merchantRouter = Router();

merchantRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}
function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** GET /api/v1/merchant/analytics/dashboard — the live "Pulse" BI snapshot. */
merchantRouter.get("/analytics/dashboard", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, pulse: await getDashboardPulse(tenantId) });
  } catch (err) {
    console.error("[merchant] dashboard pulse failed:", err);
    res.status(500).json({ ok: false, error: "Could not load dashboard analytics." });
  }
});

/**
 * GET /api/v1/merchant/analytics/summary — the owner's mobile at-a-glance vitals
 * (today's gross takings, registers open now, low-stock count). Cheap enough to
 * poll; tenant-scoped from the session.
 */
merchantRouter.get("/analytics/summary", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, summary: await getOwnerSummary(tenantId) });
  } catch (err) {
    console.error("[merchant] owner summary failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your summary." });
  }
});

/**
 * Read a positive-integer query param within [min, max], falling back to a
 * default — so a garbage/missing `?windowDays=` can't widen the scan or break
 * the maths.
 */
function clampedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * GET /api/v1/merchant/analytics/forecast — predictive inventory reorder
 * forecast (ENTERPRISE). Reads each product's real trailing-window selling
 * pace from the sales ledger and projects days-to-stockout + a suggested order
 * quantity. The tier guard rejects any store below ENTERPRISE with a 403 before
 * the query runs. Tuning via query params (all optional, clamped):
 *   ?windowDays   trailing window for velocity  (default 30, 1–365)
 *   ?coverDays    days of stock a reorder covers (default 14, 1–180)
 *   ?horizonDays  flag items depleting within    (default 21, 1–180)
 */
merchantRouter.get(
  "/analytics/forecast",
  requireFeature("predictive_inventory"),
  async (req, res) => {
    const tenantId = tenantOf(req);
    if (!tenantId) return noTenant(res);
    const opts: ForecastOptions = {
      windowDays: clampedInt(req.query.windowDays, DEFAULT_FORECAST_OPTIONS.windowDays, 1, 365),
      coverDays: clampedInt(req.query.coverDays, DEFAULT_FORECAST_OPTIONS.coverDays, 1, 180),
      horizonDays: clampedInt(req.query.horizonDays, DEFAULT_FORECAST_OPTIONS.horizonDays, 1, 180),
    };
    try {
      res.json({ ok: true, forecast: await getReorderForecast(tenantId, opts) });
    } catch (err) {
      console.error("[merchant] reorder forecast failed:", err);
      res.status(500).json({ ok: false, error: "Could not compile the inventory forecast." });
    }
  },
);

/**
 * GET /api/v1/merchant/compliance/export — monthly serialized sales ledger.
 *   ?month=YYYY-MM  (defaults to the current Manila month)
 *   ?format=csv     → download a CSV matrix; otherwise JSON (for the audit tray).
 */
merchantRouter.get("/compliance/export", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const month = typeof req.query.month === "string" ? req.query.month : undefined;
    const window = resolveMonth(month);
    const ledger = await getComplianceLedger(tenantId, window.periodStart, window.periodEnd);

    if (req.query.format === "csv") {
      const filename = `vendopos-sales-${window.periodStart.slice(0, 7)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.send(toCsv(ledger));
    }
    res.json({ ok: true, label: window.label, ledger });
  } catch (err) {
    console.error("[merchant] compliance export failed:", err);
    res.status(500).json({ ok: false, error: "Could not compile the compliance ledger." });
  }
});

/**
 * The low-stock alert handler, shared by /api/v1/merchant/inventory/alerts and
 * the spec's /api/v1/inventory/alerts mount.
 */
export async function stockAlertsHandler(req: Request, res: Response) {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    res.json({ ok: true, alerts: await getStockAlerts(tenantId) });
  } catch (err) {
    console.error("[merchant] stock alerts failed:", err);
    res.status(500).json({ ok: false, error: "Could not load stock alerts." });
  }
}

merchantRouter.get("/inventory/alerts", stockAlertsHandler);

/**
 * GET /api/v1/merchant/events/stream — the merchant's real-time alert feed
 * (SSE). Pushes a `low-stock` event the moment a sale drops a product to/below
 * its threshold. Tenant-scoped from the session; the high-water mark starts at
 * connect time so the dashboard only hears about *new* crossings while watching.
 */
const EVENTS_TICK_MS = 3_000;

merchantRouter.get("/events/stream", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
  res.write("retry: 4000\n\n");

  let alive = true;
  let highWater = new Date();
  const seen = new Set<string>();
  const send = (event: string, data: unknown) => {
    if (alive) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  async function tick() {
    if (!alive) return;
    try {
      const crossings = await getLowStockCrossingsSince(tenantId!, highWater);
      for (const c of crossings) {
        if (!seen.has(c.alert.id)) {
          seen.add(c.alert.id);
          send("low-stock", c.alert);
        }
        const at = new Date(c.at);
        if (at > highWater) highWater = at;
      }
    } catch (err) {
      console.error("[merchant] events tick failed:", err);
    }
  }

  const timer = setInterval(() => {
    res.write(": keep-alive\n\n");
    void tick();
  }, EVENTS_TICK_MS);

  req.on("close", () => {
    alive = false;
    clearInterval(timer);
    res.end();
  });
});

/**
 * Standalone /api/v1/inventory router so the alert engine is reachable at the
 * spec's `GET /api/v1/inventory/alerts`. Same role fence, same handler.
 */
export const inventoryAlertsRouter = Router();
inventoryAlertsRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));
inventoryAlertsRouter.get("/alerts", stockAlertsHandler);
