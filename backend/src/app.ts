import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { leadsRouter } from "./leads/leads.router.js";
import { authRouter } from "./auth/auth.router.js";
import { productsRouter } from "./products/products.router.js";
import { UPLOADS_ROOT } from "./products/products.storage.js";
import { adminLeadsRouter } from "./admin/adminLeads.router.js";
import { adminTenantsRouter } from "./admin/adminTenants.router.js";
import { posRouter } from "./pos/pos.router.js";
import { adminAnalyticsRouter } from "./billing/billing.router.js";
import { adminHealthRouter } from "./health/health.router.js";
import { merchantRouter, inventoryAlertsRouter } from "./merchant/merchant.router.js";
import { paymentQrRouter } from "./merchant/paymentQr.router.js";
import { staffRouter } from "./staff/staff.router.js";
import { financeRouter } from "./finance/finance.router.js";
import { procurementRouter } from "./procurement/procurement.router.js";
import { manufacturingRouter } from "./manufacturing/manufacturing.router.js";
import { hrRouter } from "./hr/hr.router.js";
import { crmRouter } from "./crm/crm.router.js";
import { accountRouter } from "./account/account.router.js";
import { notificationsRouter } from "./notifications/notifications.router.js";
import { publicRouter } from "./public/public.router.js";

/**
 * Builds the Express application. Kept separate from the server bootstrap so
 * tests can import the app without opening a port.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins,
      // credentials:true so the browser sends/stores the session cookie on
      // cross-origin XHR (frontend :3000 → API :4000). The OAuth redirects are
      // top-level navigations and aren't subject to CORS.
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  if (env.nodeEnv !== "test") {
    app.use(morgan("dev"));
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "vendopos-backend", time: new Date().toISOString() });
  });

  // Publicly served product media (local-disk storage provider). When a cloud
  // bucket is wired in, image URLs point there instead and this becomes inert.
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
      },
    }),
  );

  app.use("/auth", authRouter);
  app.use("/api/v1/public", publicRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api/inventory", productsRouter);
  app.use("/api/v1/admin/leads", adminLeadsRouter);
  app.use("/api/v1/admin/tenants", adminTenantsRouter);
  app.use("/api/v1/admin/analytics", adminAnalyticsRouter);
  app.use("/api/v1/admin/health", adminHealthRouter);
  app.use("/api/v1/pos", posRouter);
  app.use("/api/v1/merchant/payment-qrs", paymentQrRouter);
  app.use("/api/v1/merchant", merchantRouter);
  app.use("/api/v1/inventory", inventoryAlertsRouter);
  app.use("/api/v1/staff", staffRouter);
  app.use("/api/v1/finance", financeRouter);
  app.use("/api/v1/procurement", procurementRouter);
  app.use("/api/v1/manufacturing", manufacturingRouter);
  app.use("/api/v1/hr", hrRouter);
  app.use("/api/v1/crm", crmRouter);
  app.use("/api/v1/account", accountRouter);
  app.use("/api/v1/notifications", notificationsRouter);

  // Unknown route
  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not found" });
  });

  return app;
}
