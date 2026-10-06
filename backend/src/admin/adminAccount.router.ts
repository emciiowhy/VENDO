import { Router } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { uploadAccountImage } from "../account/account.upload.js";
import { putAccountImage, removeAccountImage } from "../account/account.storage.js";
import { getOwnerProfile, setAvatarUrl, updateOwnerProfile } from "../account/account.repository.js";
import { getPasswordHash, setPasswordHash } from "../auth/auth.repository.js";
import { hashPassword, verifyPassword } from "../auth/auth.crypto.js";
import { validatePassword } from "../auth/password.policy.js";
import { recordAudit } from "./adminAudit.repository.js";

/**
 * The Super Admin's own account hub, mounted at /api/v1/admin/account. The
 * platform operator sits above every Tenant and so never had a Settings surface
 * of their own — this is it: edit their identity (name, phone, avatar) and
 * rotate their sign-in password. SUPER_ADMIN only; the user scope comes
 * exclusively from the verified session, never the request body. The underlying
 * profile/password helpers are role-agnostic (keyed by user id), so this reuses
 * the same storage the merchant Account hub does — no duplicate data layer.
 */
export const adminAccountRouter = Router();

adminAccountRouter.use(requireRole("SUPER_ADMIN"));

/** Trim a free-text field to a string or null (empty → null), length-capped. */
function text(v: unknown, max = 160): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// ── Profile ───────────────────────────────────────────────────────────────

adminAccountRouter.get("/profile", async (req, res) => {
  try {
    const profile = await getOwnerProfile(req.user!.userId);
    if (!profile) return res.status(404).json({ ok: false, error: "Account not found." });
    res.json({ ok: true, profile });
  } catch (err) {
    console.error("[admin/account] profile load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your profile." });
  }
});

adminAccountRouter.patch("/profile", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = text(body.name, 120);
  if (!name) return res.status(400).json({ ok: false, error: "Your name is required." });
  try {
    await updateOwnerProfile(req.user!.userId, { name, phone: text(body.phone, 60) });
    void recordAudit({
      actorUserId: req.user!.userId,
      actorName: name,
      action: "profile_update",
      detail: "Updated profile details",
    });
    res.json({ ok: true, profile: await getOwnerProfile(req.user!.userId) });
  } catch (err) {
    console.error("[admin/account] profile update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your profile." });
  }
});

adminAccountRouter.post("/profile/avatar", uploadAccountImage, async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Choose an image to upload." });
  try {
    const avatarUrl = await putAccountImage(req.file.buffer, req.file.mimetype, "avatars");
    const previous = await setAvatarUrl(req.user!.userId, avatarUrl);
    if (previous && previous !== avatarUrl) void removeAccountImage(previous, "avatars");
    res.status(201).json({ ok: true, avatarUrl });
  } catch (err) {
    console.error("[admin/account] avatar upload failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your photo." });
  }
});

adminAccountRouter.delete("/profile/avatar", async (req, res) => {
  try {
    const previous = await setAvatarUrl(req.user!.userId, null);
    if (previous) void removeAccountImage(previous, "avatars");
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/account] avatar delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove your photo." });
  }
});

// ── Security (password) ─────────────────────────────────────────────────────

adminAccountRouter.get("/password/status", async (req, res) => {
  try {
    const hash = await getPasswordHash(req.user!.userId);
    res.json({ ok: true, hasPassword: hash !== null });
  } catch (err) {
    console.error("[admin/account] password status failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your security settings." });
  }
});

/**
 * Set or change the operator's sign-in password. When one already exists the
 * current password must verify first; mirrors /auth/password exactly, but fenced
 * to SUPER_ADMIN (that route is owner/manager-only).
 */
adminAccountRouter.post("/password", async (req, res) => {
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = body?.currentPassword === undefined ? "" : String(body.currentPassword);
  const newPassword = String(body?.newPassword ?? "");

  const newPasswordError = validatePassword(newPassword);
  if (newPasswordError) {
    return res.status(400).json({ ok: false, errors: { newPassword: newPasswordError } });
  }
  try {
    const existing = await getPasswordHash(req.user!.userId);
    if (existing && !verifyPassword(currentPassword, existing)) {
      return res
        .status(400)
        .json({ ok: false, errors: { currentPassword: "Current password is incorrect." } });
    }
    await setPasswordHash(req.user!.userId, hashPassword(newPassword));
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/account] set password failed:", err);
    res.status(500).json({ ok: false, error: "Could not update your password." });
  }
});
