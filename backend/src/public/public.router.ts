import { Router } from "express";
import { listPublicTenants } from "./public.repository.js";

/**
 * Public, UNAUTHENTICATED marketing endpoints, mounted at /api/v1/public. There
 * is intentionally no auth guard here — the only data exposed is public-safe
 * brand identity (see public.repository.ts). Keep it that way: never add a route
 * to this router that touches tenant-scoped or operational data.
 */
export const publicRouter = Router();

/**
 * GET /api/v1/public/tenants — the live "Trusted by" roster for the landing
 * page: the 12 newest active stores as `{ id, businessName, initials }`.
 */
publicRouter.get("/tenants", async (_req, res) => {
  try {
    res.json({ ok: true, tenants: await listPublicTenants() });
  } catch (err) {
    console.error("[public] tenant directory failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the tenant directory." });
  }
});
