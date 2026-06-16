import { Router } from "express";
import type { ZodError } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { provisionSchema } from "./adminLeads.schema.js";
import { listLeads, provisionLead, rejectLead } from "./adminLeads.repository.js";

/**
 * Super Admin growth pipeline — Leads Management & Tenant Provisioning.
 * Mounted at /api/v1/admin/leads and fenced to SUPER_ADMIN, so no merchant or
 * cashier token can read or manipulate the pipeline.
 */
export const adminLeadsRouter = Router();

adminLeadsRouter.use(requireRole("SUPER_ADMIN"));

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

/** GET /api/v1/admin/leads — the whole pipeline. */
adminLeadsRouter.get("/", async (_req, res) => {
  try {
    res.json({ ok: true, leads: await listLeads() });
  } catch (err) {
    console.error("[admin/leads] list failed:", err);
    res.status(500).json({ ok: false, error: "Could not load the leads pipeline." });
  }
});

/** POST /api/v1/admin/leads/:id/approve — atomic lead → tenant promotion. */
adminLeadsRouter.post("/:id/approve", async (req, res) => {
  const parsed = provisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
  }
  try {
    const result = await provisionLead(req.params.id, parsed.data);
    if (result.ok) {
      // `onboardingEmailTo` echoes the address the onboarding mail was dispatched
      // to (sent best-effort inside provisionLead) so the drawer can confirm it;
      // `mailDelivered` reports whether it actually reached the transport, so the
      // UI can warn instead of falsely promising an email that a Resend rejection
      // silently dropped.
      return res.status(201).json({
        ok: true,
        tenant: result.tenant,
        lead: result.lead,
        onboardingEmailTo: parsed.data.ownerEmail,
        mailDelivered: result.mailDelivered,
      });
    }
    switch (result.error.code) {
      case "NOT_FOUND":
        return res.status(404).json({ ok: false, error: "That lead no longer exists." });
      case "ALREADY_HANDLED":
        return res.status(409).json({
          ok: false,
          error: `This lead was already ${result.error.status.toLowerCase().replace("_demo", "")}.`,
        });
      case "SLUG_TAKEN":
        return res.status(409).json({
          ok: false,
          error: "That Store ID is already taken. Try a different slug.",
          field: "slug",
        });
      case "EMAIL_TAKEN":
        return res.status(409).json({
          ok: false,
          error: "That email already has a VendoPOS account.",
          field: "ownerEmail",
        });
    }
  } catch (err) {
    console.error("[admin/leads] provisioning failed:", err);
    return res.status(500).json({ ok: false, error: "Provisioning failed. Nothing was created." });
  }
});

/** POST /api/v1/admin/leads/:id/reject — decline a pending lead. */
adminLeadsRouter.post("/:id/reject", async (req, res) => {
  try {
    const lead = await rejectLead(req.params.id);
    if (!lead) {
      return res.status(409).json({ ok: false, error: "Only pending leads can be rejected." });
    }
    res.json({ ok: true, lead });
  } catch (err) {
    console.error("[admin/leads] reject failed:", err);
    res.status(500).json({ ok: false, error: "Could not update the lead." });
  }
});
