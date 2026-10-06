import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { broadcastRecipientCount, notifyBroadcast } from "../notifications/notifications.repository.js";
import { recordAudit } from "./adminAudit.repository.js";
import { PLAN_SPECS } from "../billing/plans.js";
import type { Plan } from "../billing/plans.js";

/**
 * Super-Admin platform broadcaster, mounted at /api/v1/admin/broadcast. One
 * lever to push a notice into every targeted merchant's notification bell via
 * the existing fan-out pipeline. SUPER_ADMIN only — a broadcast reaches every
 * store, so it sits well above any single Tenant. Each send is recorded to the
 * platform audit trail.
 */
export const adminBroadcastRouter = Router();

adminBroadcastRouter.use(requireRole("SUPER_ADMIN"));

const planSchema = z.enum(["starter", "business", "enterprise"]);

/** The audience filter: a single plan tier, or omitted/null for every store. */
function parsePlan(raw: unknown): Plan | null {
  const parsed = planSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A human label for the targeted audience, for the audit detail + response. */
function audienceLabel(plan: Plan | null): string {
  return plan ? `${PLAN_SPECS[plan].label} stores` : "All stores";
}

/**
 * GET /api/v1/admin/broadcast/recipients?plan=business — how many merchants the
 * current audience selection would reach, so the composer can preview before the
 * admin commits. `plan` omitted → every active store.
 */
adminBroadcastRouter.get("/recipients", async (req, res) => {
  const plan = parsePlan(req.query.plan);
  try {
    res.json({ ok: true, count: await broadcastRecipientCount(plan) });
  } catch (err) {
    console.error("[admin/broadcast] recipient count failed:", err);
    res.status(500).json({ ok: false, error: "Could not count recipients." });
  }
});

const sendSchema = z.object({
  title: z.string().trim().min(1, "A headline is required.").max(120),
  body: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
  severity: z.enum(["info", "success", "warning", "danger"]).default("info"),
  plan: planSchema.nullish(),
});

/** POST /api/v1/admin/broadcast — fan a notice out to the chosen audience. */
adminBroadcastRouter.post("/", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid broadcast." });
  }
  const plan = parsed.data.plan ?? null;
  try {
    const delivered = await notifyBroadcast({
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity,
      plan,
    });
    void recordAudit({
      actorUserId: req.user!.userId,
      actorName: req.user!.name,
      action: "broadcast",
      targetName: audienceLabel(plan),
      detail: `“${parsed.data.title}” → ${delivered} merchant${delivered === 1 ? "" : "s"}`,
    });
    res.json({ ok: true, delivered, audience: audienceLabel(plan) });
  } catch (err) {
    console.error("[admin/broadcast] send failed:", err);
    res.status(500).json({ ok: false, error: "Could not send the broadcast." });
  }
});
