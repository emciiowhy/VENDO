import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { leadsRouter } from "./leads/leads.router.js";
import { authRouter } from "./auth/auth.router.js";
import { productsRouter } from "./products/products.router.js";
import { UPLOADS_ROOT, serveMedia } from "./media/media.store.js";
import { adminLeadsRouter } from "./admin/adminLeads.router.js";
import { adminTenantsRouter } from "./admin/adminTenants.router.js";
import { adminSupportRouter } from "./admin/adminSupport.router.js";
import { adminRiskRouter } from "./admin/adminRisk.router.js";
import { adminBroadcastRouter } from "./admin/adminBroadcast.router.js";
import { adminAuditRouter } from "./admin/adminAudit.router.js";
import { adminAccountRouter } from "./admin/adminAccount.router.js";
import { posRouter } from "./pos/pos.router.js";
import { adminAnalyticsRouter } from "./billing/billing.router.js";
import { adminHealthRouter } from "./health/health.router.js";
import { adminComplianceRouter } from "./admin/adminCompliance.router.js";
import { merchantRouter, inventoryAlertsRouter } from "./merchant/merchant.router.js";
import { stockMovementsRouter } from "./inventory/stockMovements.router.js";
import { paymentQrRouter } from "./merchant/paymentQr.router.js";
import { staffRouter } from "./staff/staff.router.js";
import { financeRouter } from "./finance/finance.router.js";
import { hrRouter } from "./hr/hr.router.js";
import { timecardRouter } from "./hr/timecard.router.js";
import { crmRouter } from "./crm/crm.router.js";
import { accountRouter } from "./account/account.router.js";
import { notificationsRouter } from "./notifications/notifications.router.js";
import { publicRouter } from "./public/public.router.js";
import { enforceTrialStatus } from "./billing/trial.middleware.js";
import { csrfOriginGuard } from "./auth/csrf.js";

/**
 * Builds the Express application. Kept separate from the server bootstrap so
 * tests can import the app without opening a port.
 */
export function createApp() {
  const app = express();

  // Behind a hosting proxy in production, the client IP arrives in
  // X-Forwarded-For. Trust exactly one hop so `req.ip` (and the rate limiters
  // keyed on it) see the real caller, not the proxy. Left off in dev/test where
  // there is no proxy, which also keeps express-rate-limit's spoofing check happy.
  if (env.isProd) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      // credentials:true so the browser sends/stores the session cookie on
      // cross-origin XHR (frontend :3000 → API :4000). The OAuth redirects are
      // top-level navigations and aren't subject to CORS.
      credentials: true,
      // Must list every verb the API uses: a cross-origin credentialed JSON
      // request (e.g. the Theme Studio's PUT /account/theme-config, or PUT
      // /hr/attendance) triggers a CORS preflight, and the browser blocks the
      // real call unless the method is echoed back here. Omitting PUT surfaced
      // on the client as a misleading "Could not reach the server" fetch reject.
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  // CSRF defence: every state-changing request must originate from an allowlisted
  // origin (same list CORS trusts). Mounted before the routes so it fences the
  // whole API — including body-less mutations like POST /auth/logout that the
  // JSON-preflight does not. Read-only verbs pass straight through.
  app.use(csrfOriginGuard);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "vendopos-backend", time: new Date().toISOString() });
  });

  // Publicly served media: the durable Postgres store first, then any legacy
  // file still on local disk (pre-migration uploads in dev).
  app.use("/uploads", serveMedia);
  app.use(
    "/uploads",
    express.static(UPLOADS_ROOT, {
      immutable: true,
      maxAge: "30d",
      fallthrough: true,
      // helmet defaults Cross-Origin-Resource-Policy to same-origin, which blocks
      // the Next.js frontend (:3000) from rendering images served here (:4000).
      // Relax it for public product media so <img> tags resolve cross-origin.
      setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        // Mirror serveMedia's hardening on the legacy static path: a stored SVG
        // opened directly on the API origin must never execute script. `sandbox`
        // (no allow-scripts) + default-src 'none' neutralises active content.
        res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      },
    }),
  );

  app.use("/auth", authRouter);
  app.use("/api/v1/public", publicRouter);
  app.use("/api/leads", leadsRouter);

  // Trial checkpoint — fence a lapsed-trial store out of every authenticated
  // merchant module below this line (402 + recovery marker). Mounted AFTER the
  // public, auth and lead-capture seams so sign-in, /auth/me and the marketing
  // site stay reachable for an expired store (the owner must be able to get back
  // in to recover), and BEFORE the merchant/admin route block. It's a no-op for
  // unauthenticated requests and for tenant-less Super Admin sessions.
  app.use(enforceTrialStatus());

  app.use("/api/inventory", productsRouter);
  app.use("/api/v1/admin/leads", adminLeadsRouter);
  app.use("/api/v1/admin/tenants", adminTenantsRouter);
  // Support/operate actions on a subscriber (A1 credentials, A2 timeline, A3
  // force-close) share the tenants base path; two routers on one mount is fine
  // and keeps the support surface in its own file.
  app.use("/api/v1/admin/tenants", adminSupportRouter);
  app.use("/api/v1/admin/at-risk", adminRiskRouter);
  app.use("/api/v1/admin/broadcast", adminBroadcastRouter);
  app.use("/api/v1/admin/audit", adminAuditRouter);
  app.use("/api/v1/admin/account", adminAccountRouter);
  app.use("/api/v1/admin/analytics", adminAnalyticsRouter);
  app.use("/api/v1/admin/health", adminHealthRouter);
  app.use("/api/v1/admin/compliance", adminComplianceRouter);
  app.use("/api/v1/pos", posRouter);
  app.use("/api/v1/merchant/payment-qrs", paymentQrRouter);
  // The shift clock is cashier-accessible, so it MUST mount before the
  // owner/manager-only merchantRouter — otherwise that router's role guard would
  // 403 a cashier's clock-in before this more-specific path is ever reached.
  app.use("/api/v1/merchant/shifts", timecardRouter);
  app.use("/api/v1/merchant", merchantRouter);
  app.use("/api/v1/inventory", inventoryAlertsRouter);
  app.use("/api/v1/inventory", stockMovementsRouter);
  app.use("/api/v1/staff", staffRouter);
  app.use("/api/v1/finance", financeRouter);
  // Procurement and Manufacturing are retired (capstone scope): their routers are
  // no longer mounted, so those APIs 404. The code and every table/row are kept —
  // nothing is deleted — and Finance still reads past purchase orders.
  // Payroll is removed: owners work out pay from the hours in the Cashiers module
  // (/api/v1/staff/attendance). Staff self-service (paystubs) went with it, so
  // the ESS router is unmounted; a worker's own clock stays at /merchant/shifts/me.
  app.use("/api/v1/hr", hrRouter);
  app.use("/api/v1/crm", crmRouter);
  app.use("/api/v1/account", accountRouter);
  app.use("/api/v1/notifications", notificationsRouter);

  // Unknown route
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  // Central error handler (must be last, 4-arg signature). Turns any error that
  // escapes a route into a consistent JSON shape and — crucially — never leaks a
  // stack trace or internal message to the client; the full error is logged
  // server-side only. Common body-parser failures get precise status codes.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const e = err as { type?: string; status?: number } | undefined;
    if (e?.type === "entity.parse.failed" || err instanceof SyntaxError) {
      return res.status(400).json({ ok: false, error: "Malformed request body." });
    }
    if (e?.type === "entity.too.large" || e?.status === 413) {
      return res.status(413).json({ ok: false, error: "Request payload too large." });
    }
    console.error("[error]", err);
    if (res.headersSent) return next(err);
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  });

  return app;
}
