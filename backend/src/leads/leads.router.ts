import { Router } from "express";
import { enterpriseIntakeSchema, leadSchema } from "./leads.schema.js";
import { insertLead, listLeads } from "./leads.repository.js";
import { sendEnterpriseLeadAlertEmail } from "../notifications/enterpriseLeadEmail.js";
import { leadLimiter } from "../auth/rateLimit.js";
import { requireRole } from "../auth/auth.middleware.js";

export const leadsRouter = Router();

/** Collapse a Zod parse failure into the `{ field: message }` shape the form reads. */
function fieldErrorsOf(error: { issues: { path: (string | number)[]; message: string }[] }) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * POST /api/leads — the landing page's only behavioral action.
 *
 * Validates the demo-form payload, persists it as a Lead, and returns the
 * stored record. Invalid payloads return 400 with field-level errors and do
 * NOT record a Lead.
 */
leadsRouter.post("/", leadLimiter, async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, errors: fieldErrorsOf(parsed.error) });
  }

  try {
    const lead = await insertLead(parsed.data);
    // First cut: persisted to NeonDB. A future iteration also notifies the Super Admin.
    return res.status(201).json({ ok: true, lead });
  } catch (err) {
    console.error("[leads] failed to persist lead:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Something went wrong saving your request. Please try again." });
  }
});

/**
 * POST /api/leads/enterprise — the Enterprise concierge intake.
 *
 * Enterprise is never self-served into a trial: the prospect lands here from the
 * pricing page's Enterprise card. We validate the richer operational payload,
 * persist it into the same pipeline as a demo lead (the extra detail folded into
 * the lead's message so the Super Admin pipeline shows it), then dispatch an
 * internal admin alert email carrying those operational details so a rep can
 * book the 1-on-1 Zoom consultation and scope the in-person rollout. The mail is
 * best-effort and never blocks the submission — `mailDelivered` reports whether
 * it actually went out (false on a key-less log transport or a provider reject).
 */
leadsRouter.post("/enterprise", leadLimiter, async (req, res) => {
  const parsed = enterpriseIntakeSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, errors: fieldErrorsOf(parsed.error) });
  }

  const d = parsed.data;
  const currentSystem = d.currentSystem && d.currentSystem.length > 0 ? d.currentSystem : null;
  const notes = d.message && d.message.length > 0 ? d.message : null;

  // Fold the Enterprise-specific operational detail into the shared lead's
  // message so it surfaces in the existing Super Admin pipeline view as-is.
  const composedMessage = [
    "[Enterprise inquiry]",
    `Locations: ${d.locations}`,
    currentSystem ? `Current system: ${currentSystem}` : null,
    notes ? `Notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const lead = await insertLead({
      name: d.name,
      businessName: d.businessName,
      email: d.email,
      phone: d.phone,
      businessType: "Other",
      message: composedMessage,
    });

    // Dispatch the internal admin alert with the operational details (best-effort).
    const mail = await sendEnterpriseLeadAlertEmail({
      contactName: d.name,
      businessName: d.businessName,
      email: d.email,
      phone: d.phone,
      locations: d.locations,
      currentSystem,
      notes,
    });

    return res.status(201).json({ ok: true, lead, mailDelivered: mail.delivered });
  } catch (err) {
    console.error("[leads] failed to persist enterprise inquiry:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Something went wrong sending your inquiry. Please try again." });
  }
});

/**
 * GET /api/leads — recent Leads, most recent first. Guarded to SUPER_ADMIN: this
 * returns prospect PII (name, email, phone), so it must never be world-readable.
 * The primary pipeline view is /api/v1/admin/leads; this legacy read is kept only
 * for compatibility, now behind the same platform-admin gate.
 */
leadsRouter.get("/", requireRole("SUPER_ADMIN"), async (_req, res) => {
  try {
    const leads = await listLeads();
    return res.json({ ok: true, leads });
  } catch (err) {
    console.error("[leads] failed to list leads:", err);
    return res.status(500).json({ ok: false, error: "Could not load leads." });
  }
});
