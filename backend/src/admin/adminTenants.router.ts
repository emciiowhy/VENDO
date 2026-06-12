import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { getSubscribers } from "../billing/billing.repository.js";
import { updateTenant } from "./adminTenants.repository.js";

/**
 * Super-Admin tenant control plane, mounted at /api/v1/admin/tenants. This is
 * where every provisioned subscriber becomes manageable in one place: list the
 * live directory and change a tenant's plan or status. SUPER_ADMIN only — these
 * operations sit above any single Tenant, so no merchant token can reach them.
 */
export const adminTenantsRouter = Router();

adminTenantsRouter.use(requireRole("SUPER_ADMIN"));

/** GET /api/v1/admin/tenants — the full directory of store environments. */
adminTenantsRouter.get("/", async (_req, res) => {
  try {
    res.json({ ok: true, tenants: await getSubscribers() });
  } catch (err) {
    console.error("[admin/tenants] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load tenants." });
  }
});

const patchSchema = z
  .object({
    plan: z.enum(["starter", "business", "enterprise"]).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .refine((b) => b.plan !== undefined || b.status !== undefined, {
    message: "Choose a plan or status to change.",
  });

const UUID = /^[0-9a-f-]{36}$/i;

/** PATCH /api/v1/admin/tenants/:id — change a tenant's plan and/or status. */
adminTenantsRouter.patch("/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) {
    return res.status(400).json({ ok: false, error: "Unknown tenant." });
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid update." });
  }
  try {
    const tenant = await updateTenant(req.params.id, parsed.data);
    if (!tenant) return res.status(404).json({ ok: false, error: "Tenant not found." });
    return res.json({ ok: true, tenant });
  } catch (err) {
    console.error("[admin/tenants] update failed:", err);
    return res.status(500).json({ ok: false, error: "Could not update the tenant." });
  }
});
