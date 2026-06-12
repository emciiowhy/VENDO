import { Router } from "express";
import { leadSchema } from "./leads.schema.js";
import { insertLead, listLeads } from "./leads.repository.js";

export const leadsRouter = Router();

/**
 * POST /api/leads — the landing page's only behavioral action.
 *
 * Validates the demo-form payload, persists it as a Lead, and returns the
 * stored record. Invalid payloads return 400 with field-level errors and do
 * NOT record a Lead.
 */
leadsRouter.post("/", async (req, res) => {
  const parsed = leadSchema.safeParse(req.body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return res.status(400).json({ ok: false, errors: fieldErrors });
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
 * GET /api/leads — recent Leads, most recent first.
 * Placeholder read for a future Super Admin pipeline view (no auth yet — see README).
 */
leadsRouter.get("/", async (_req, res) => {
  try {
    const leads = await listLeads();
    return res.json({ ok: true, leads });
  } catch (err) {
    console.error("[leads] failed to list leads:", err);
    return res.status(500).json({ ok: false, error: "Could not load leads." });
  }
});
