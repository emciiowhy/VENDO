import { Router } from "express";
import { z } from "zod";
import { requireRole } from "../auth/auth.middleware.js";
import { generateTempPassword, hashPassword } from "../auth/auth.crypto.js";
import { setPasswordHash } from "../auth/auth.repository.js";
import { forceCloseShiftForCashier } from "../pos/shifts.repository.js";
import { sendOwnerOnboardingEmail } from "../notifications/onboardingEmail.js";
import { sendPasswordResetEmail } from "../notifications/supportEmail.js";
import { recordAudit } from "./adminAudit.repository.js";
import {
  getTenantOwnerForSupport,
  tenantNameForSupport,
  listOpenShifts,
  listTenantTimeline,
  createSupportNote,
  updateSupportNote,
  deleteSupportNote,
} from "./adminSupport.repository.js";

/**
 * Super-Admin support/operate surface, mounted (alongside adminTenantsRouter) at
 * /api/v1/admin/tenants. These are the actions an operator takes ON a subscriber
 * once the directory has surfaced a troubled store: recover the owner's
 * credentials (A1), read/append a support narrative (A2), and force-close a
 * stuck cashier shift (A3). SUPER_ADMIN only; every privileged action is written
 * to the audit trail so it shows up in the same per-tenant timeline.
 */
export const adminSupportRouter = Router();

adminSupportRouter.use(requireRole("SUPER_ADMIN"));

const UUID = /^[0-9a-f-]{36}$/i;

/** Pull a validated tenant id off the path, or 400. */
function tenantId(req: { params: Record<string, string> }): string | null {
  const id = req.params.id;
  return typeof id === "string" && UUID.test(id) ? id : null;
}

/* ------------------------------ A1: credentials ----------------------------- */

/** POST /:id/reset-owner-password — mint a temp password for the store owner. */
adminSupportRouter.post("/:id/reset-owner-password", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  try {
    const owner = await getTenantOwnerForSupport(id);
    if (!owner) {
      return res.status(404).json({ ok: false, error: "This store has no active owner." });
    }
    const tempPassword = generateTempPassword();
    await setPasswordHash(owner.ownerId, hashPassword(tempPassword));

    const mail = await sendPasswordResetEmail({
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail,
      storeName: owner.tenantName,
      slug: owner.slug,
      tempPassword,
    });

    void recordAudit({
      actorUserId: req.user!.userId,
      actorName: req.user!.name,
      action: "owner_password_reset",
      targetTenantId: id,
      targetName: owner.tenantName,
      detail: `Reset password for owner ${owner.ownerEmail}`,
    });

    // The temp password rides back ONCE so the admin can read it to the owner;
    // it is never stored in the clear and never re-retrievable after this call.
    return res.json({
      ok: true,
      tempPassword,
      ownerEmail: owner.ownerEmail,
      mailDelivered: mail.delivered,
    });
  } catch (err) {
    console.error("[admin/support] reset owner password failed:", err);
    return res.status(500).json({ ok: false, error: "Could not reset the owner's password." });
  }
});

/** POST /:id/resend-onboarding — re-send the welcome / sign-in email. */
adminSupportRouter.post("/:id/resend-onboarding", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  try {
    const owner = await getTenantOwnerForSupport(id);
    if (!owner) {
      return res.status(404).json({ ok: false, error: "This store has no active owner." });
    }
    const mail = await sendOwnerOnboardingEmail({
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail,
      storeName: owner.tenantName,
      slug: owner.slug ?? "",
      plan: owner.plan,
      hasPassword: owner.hasPassword,
    });

    void recordAudit({
      actorUserId: req.user!.userId,
      actorName: req.user!.name,
      action: "onboarding_resend",
      targetTenantId: id,
      targetName: owner.tenantName,
      detail: `Re-sent onboarding email to ${owner.ownerEmail}`,
    });

    return res.json({ ok: true, ownerEmail: owner.ownerEmail, mailDelivered: mail.delivered });
  } catch (err) {
    console.error("[admin/support] resend onboarding failed:", err);
    return res.status(500).json({ ok: false, error: "Could not re-send the onboarding email." });
  }
});

/* ------------------------------ A3: force-close ----------------------------- */

/** GET /:id/open-shifts — the tenant's open shifts awaiting a Z-Read. */
adminSupportRouter.get("/:id/open-shifts", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  try {
    return res.json({ ok: true, shifts: await listOpenShifts(id) });
  } catch (err) {
    console.error("[admin/support] list open shifts failed:", err);
    return res.status(500).json({ ok: false, error: "Could not load open shifts." });
  }
});

const forceCloseSchema = z.object({
  cashierUserId: z.string().regex(UUID, "Choose a shift to close."),
  note: z.string().trim().max(280).optional(),
});

/** POST /:id/force-close-shift — remote Z-Read of a stuck cashier shift. */
adminSupportRouter.post("/:id/force-close-shift", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  const parsed = forceCloseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." });
  }
  try {
    // null count → the reconciler records the expected cash (zero variance) and
    // tags the note "drawer not counted": correct for a remote admin who can't
    // physically count the till. The admin's name is stamped into the Z-Read.
    const result = await forceCloseShiftForCashier(
      id,
      parsed.data.cashierUserId,
      null,
      parsed.data.note ?? null,
      req.user!.name,
    );
    if (!result.ok) {
      return res.status(409).json({ ok: false, error: "That cashier has no open shift." });
    }

    void recordAudit({
      actorUserId: req.user!.userId,
      actorName: req.user!.name,
      action: "shift_force_close",
      targetTenantId: id,
      targetName: await tenantNameForSupport(id),
      detail: `Force-closed ${result.zread.cashierName}'s shift (drawer not counted)`,
    });

    return res.json({ ok: true, zread: result.zread });
  } catch (err) {
    console.error("[admin/support] force-close shift failed:", err);
    return res.status(500).json({ ok: false, error: "Could not force-close the shift." });
  }
});

/* ------------------------------ A2: support notes --------------------------- */

/** GET /:id/timeline — manual notes UNION'd with this tenant's audit events. */
adminSupportRouter.get("/:id/timeline", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  try {
    return res.json({ ok: true, timeline: await listTenantTimeline(id) });
  } catch (err) {
    console.error("[admin/support] timeline failed:", err);
    return res.status(500).json({ ok: false, error: "Could not load the support timeline." });
  }
});

const noteSchema = z.object({
  body: z.string().trim().min(1, "Write a note.").max(2000),
});

/** POST /:id/notes — append a support note. */
adminSupportRouter.post("/:id/notes", async (req, res) => {
  const id = tenantId(req);
  if (!id) return res.status(400).json({ ok: false, error: "Unknown tenant." });
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." });
  }
  try {
    const note = await createSupportNote(id, req.user!.userId, req.user!.name, parsed.data.body);
    return res.status(201).json({ ok: true, note });
  } catch (err) {
    console.error("[admin/support] create note failed:", err);
    return res.status(500).json({ ok: false, error: "Could not save the note." });
  }
});

/** PATCH /:id/notes/:noteId — edit a note's body. */
adminSupportRouter.patch("/:id/notes/:noteId", async (req, res) => {
  const id = tenantId(req);
  if (!id || !UUID.test(req.params.noteId)) {
    return res.status(400).json({ ok: false, error: "Unknown note." });
  }
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." });
  }
  try {
    const note = await updateSupportNote(id, req.params.noteId, parsed.data.body);
    if (!note) return res.status(404).json({ ok: false, error: "That note no longer exists." });
    return res.json({ ok: true, note });
  } catch (err) {
    console.error("[admin/support] update note failed:", err);
    return res.status(500).json({ ok: false, error: "Could not update the note." });
  }
});

/** DELETE /:id/notes/:noteId — remove a note. */
adminSupportRouter.delete("/:id/notes/:noteId", async (req, res) => {
  const id = tenantId(req);
  if (!id || !UUID.test(req.params.noteId)) {
    return res.status(400).json({ ok: false, error: "Unknown note." });
  }
  try {
    const removed = await deleteSupportNote(id, req.params.noteId);
    if (!removed) return res.status(404).json({ ok: false, error: "That note no longer exists." });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/support] delete note failed:", err);
    return res.status(500).json({ ok: false, error: "Could not delete the note." });
  }
});
