import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth/auth.middleware.js";
import { getPasswordHash, tenantNameById } from "../auth/auth.repository.js";
import { verifyPassword } from "../auth/auth.crypto.js";
import { uploadAccountImage } from "./account.upload.js";
import { putAccountImage, removeAccountImage } from "./account.storage.js";
import {
  deactivateStore,
  exportDataset,
  getOwnerProfile,
  getPreferences,
  getReceiptSettings,
  getStoreProfile,
  isExportDataset,
  listLoginEvents,
  listSessions,
  revokeOtherSessions,
  revokeOwnSession,
  setAvatarUrl,
  setLogoUrl,
  setThemeColor,
  slugTakenByOther,
  updateOwnerProfile,
  updatePreferences,
  updateReceiptSettings,
  updateStoreProfile,
  updateStoreSlug,
  type Preferences,
} from "./account.repository.js";

/**
 * The owner Account hub, mounted at /api/v1/account and fenced to store
 * management (MERCHANT_OWNER / MANAGER). Tenant + user scope come exclusively
 * from the verified session — never the request body. Store deactivation is
 * additionally gated to the OWNER alone (see its own guard).
 */
export const accountRouter = Router();

accountRouter.use(requireRole("MERCHANT_OWNER", "MANAGER"));

function tenantOf(req: Request): string | null {
  return req.user?.tenantId ?? null;
}
function noTenant(res: Response) {
  return res.status(403).json({ ok: false, error: "No store is associated with this account." });
}

/** Trim a free-text field to a string or null (empty → null). Caps length defensively. */
function text(v: unknown, max = 240): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// ── Store profile ───────────────────────────────────────────────────────────

accountRouter.get("/store", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const store = await getStoreProfile(tenantId);
    if (!store) return res.status(404).json({ ok: false, error: "Store not found." });
    res.json({ ok: true, store });
  } catch (err) {
    console.error("[account] store load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your store profile." });
  }
});

accountRouter.patch("/store", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const body = req.body as Record<string, unknown>;
  const name = text(body.name, 120);
  if (!name) return res.status(400).json({ ok: false, error: "Store name is required." });

  // The Store ID (slug) is the login key, so changing it is validated + unique.
  const rawSlug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  try {
    if (rawSlug) {
      if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(rawSlug)) {
        return res.status(400).json({
          ok: false,
          errors: { slug: "Use 2–49 lowercase letters, numbers or hyphens." },
        });
      }
      if (await slugTakenByOther(rawSlug, tenantId)) {
        return res.status(409).json({ ok: false, errors: { slug: "That Store ID is already taken." } });
      }
      await updateStoreSlug(tenantId, rawSlug);
    }
    await updateStoreProfile(tenantId, {
      name,
      address: text(body.address, 400),
      phone: text(body.phone, 60),
      email: text(body.email, 160),
      businessHours: text(body.businessHours, 200),
      tin: text(body.tin, 40),
    });
    res.json({ ok: true, store: await getStoreProfile(tenantId) });
  } catch (err) {
    console.error("[account] store update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your store profile." });
  }
});

accountRouter.post("/store/logo", uploadAccountImage, async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  if (!req.file) return res.status(400).json({ ok: false, error: "Choose a logo image to upload." });
  try {
    const logoUrl = await putAccountImage(req.file.buffer, req.file.mimetype, "logos");
    const previous = await setLogoUrl(tenantId, logoUrl);
    if (previous && previous !== logoUrl) void removeAccountImage(previous, "logos");
    res.status(201).json({ ok: true, logoUrl });
  } catch (err) {
    console.error("[account] logo upload failed:", err);
    res.status(500).json({ ok: false, error: "Could not save the logo." });
  }
});

accountRouter.delete("/store/logo", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const previous = await setLogoUrl(tenantId, null);
    if (previous) void removeAccountImage(previous, "logos");
    res.json({ ok: true });
  } catch (err) {
    console.error("[account] logo delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove the logo." });
  }
});

// ── Appearance / brand theme ──────────────────────────────────────────────────

/** Validate `#rgb`/`#rrggbb` and normalise to lowercase `#rrggbb`, else null. */
function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let s = v.trim().toLowerCase();
  if (s && s[0] !== "#") s = "#" + s;
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return /^#[0-9a-f]{6}$/.test(s) ? s : null;
}

/**
 * PATCH /account/theme — set or clear the store's brand accent colour.
 * Body: `{ accent: "#rrggbb" | null }`. A null/empty accent resets to the
 * default VendoPOS blue. Stored as the only source of truth; the workspace
 * derives the full ramp from it client-side.
 */
accountRouter.patch("/theme", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const raw = (req.body as { accent?: unknown })?.accent;
  let accent: string | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    accent = normalizeHex(raw);
    if (!accent) {
      return res.status(400).json({ ok: false, error: "Enter a valid colour, e.g. #2b50ea." });
    }
  }
  try {
    await setThemeColor(tenantId, accent);
    res.json({ ok: true, accent });
  } catch (err) {
    console.error("[account] theme update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your theme." });
  }
});

// ── Receipt customization ─────────────────────────────────────────────────────

accountRouter.get("/receipt", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  try {
    const settings = await getReceiptSettings(tenantId);
    if (!settings) return res.status(404).json({ ok: false, error: "Store not found." });
    res.json({ ok: true, settings });
  } catch (err) {
    console.error("[account] receipt load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load receipt settings." });
  }
});

accountRouter.patch("/receipt", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const body = req.body as Record<string, unknown>;
  let invoicePrefix: string | null = null;
  if (typeof body.invoicePrefix === "string" && body.invoicePrefix.trim()) {
    const p = body.invoicePrefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(p)) {
      return res.status(400).json({
        ok: false,
        errors: { invoicePrefix: "1–6 letters or numbers (e.g. SI)." },
      });
    }
    invoicePrefix = p;
  }
  try {
    await updateReceiptSettings(tenantId, {
      header: text(body.header, 160),
      footer: text(body.footer, 240),
      vatLabel: text(body.vatLabel, 40),
      invoicePrefix,
      showLogo: body.showLogo !== false,
      ptu: text(body.ptu, 40),
      min: text(body.min, 40),
      serial: text(body.serial, 40),
    });
    res.json({ ok: true, settings: await getReceiptSettings(tenantId) });
  } catch (err) {
    console.error("[account] receipt update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save receipt settings." });
  }
});

// ── Personal profile ──────────────────────────────────────────────────────────

accountRouter.get("/profile", async (req, res) => {
  try {
    const profile = await getOwnerProfile(req.user!.userId);
    if (!profile) return res.status(404).json({ ok: false, error: "Account not found." });
    res.json({ ok: true, profile });
  } catch (err) {
    console.error("[account] profile load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your profile." });
  }
});

accountRouter.patch("/profile", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const name = text(body.name, 120);
  if (!name) return res.status(400).json({ ok: false, error: "Your name is required." });
  try {
    await updateOwnerProfile(req.user!.userId, { name, phone: text(body.phone, 60) });
    res.json({ ok: true, profile: await getOwnerProfile(req.user!.userId) });
  } catch (err) {
    console.error("[account] profile update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your profile." });
  }
});

accountRouter.post("/profile/avatar", uploadAccountImage, async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "Choose an image to upload." });
  try {
    const avatarUrl = await putAccountImage(req.file.buffer, req.file.mimetype, "avatars");
    const previous = await setAvatarUrl(req.user!.userId, avatarUrl);
    if (previous && previous !== avatarUrl) void removeAccountImage(previous, "avatars");
    res.status(201).json({ ok: true, avatarUrl });
  } catch (err) {
    console.error("[account] avatar upload failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your photo." });
  }
});

accountRouter.delete("/profile/avatar", async (req, res) => {
  try {
    const previous = await setAvatarUrl(req.user!.userId, null);
    if (previous) void removeAccountImage(previous, "avatars");
    res.json({ ok: true });
  } catch (err) {
    console.error("[account] avatar delete failed:", err);
    res.status(500).json({ ok: false, error: "Could not remove your photo." });
  }
});

// ── Preferences ───────────────────────────────────────────────────────────────

accountRouter.get("/preferences", async (req, res) => {
  try {
    const preferences = await getPreferences(req.user!.userId);
    if (!preferences) return res.status(404).json({ ok: false, error: "Account not found." });
    res.json({ ok: true, preferences });
  } catch (err) {
    console.error("[account] preferences load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your preferences." });
  }
});

accountRouter.patch("/preferences", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const theme: Preferences["theme"] =
    body.theme === "light" || body.theme === "dark" || body.theme === "system"
      ? body.theme
      : "system";
  try {
    await updatePreferences(req.user!.userId, {
      theme,
      notifyLowStock: body.notifyLowStock !== false,
      notifyVariance: body.notifyVariance !== false,
      notifyDailySummary: body.notifyDailySummary === true,
    });
    res.json({ ok: true, preferences: await getPreferences(req.user!.userId) });
  } catch (err) {
    console.error("[account] preferences update failed:", err);
    res.status(500).json({ ok: false, error: "Could not save your preferences." });
  }
});

// ── Device sessions ─────────────────────────────────────────────────────────

accountRouter.get("/sessions", async (req, res) => {
  try {
    const sessions = await listSessions(req.user!.userId, req.user!.sid ?? null);
    res.json({ ok: true, sessions });
  } catch (err) {
    console.error("[account] sessions load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your active sessions." });
  }
});

accountRouter.delete("/sessions/:id", async (req, res) => {
  const sid = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(sid)) {
    return res.status(400).json({ ok: false, error: "Unknown session." });
  }
  try {
    const ok = await revokeOwnSession(req.user!.userId, sid);
    if (!ok) return res.status(404).json({ ok: false, error: "That session wasn’t found." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[account] session revoke failed:", err);
    res.status(500).json({ ok: false, error: "Could not sign out that device." });
  }
});

accountRouter.post("/sessions/revoke-others", async (req, res) => {
  try {
    const revoked = await revokeOtherSessions(req.user!.userId, req.user!.sid ?? null);
    res.json({ ok: true, revoked });
  } catch (err) {
    console.error("[account] revoke-others failed:", err);
    res.status(500).json({ ok: false, error: "Could not sign out your other devices." });
  }
});

// ── Login audit ───────────────────────────────────────────────────────────────

accountRouter.get("/login-events", async (req, res) => {
  try {
    const events = await listLoginEvents(req.user!.userId, 25);
    res.json({ ok: true, events });
  } catch (err) {
    console.error("[account] login events load failed:", err);
    res.status(500).json({ ok: false, error: "Could not load your sign-in history." });
  }
});

// ── Data export ─────────────────────────────────────────────────────────────

/** RFC-4180-ish CSV cell: quote when it contains a comma, quote or newline. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Filesystem-safe slug of the store's name, for naming export downloads. */
function storeSlug(name: string | null): string {
  const slug = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "store";
}

accountRouter.get("/export/:dataset", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const dataset = req.params.dataset.replace(/\.csv$/i, "");
  if (!isExportDataset(dataset)) {
    return res.status(400).json({ ok: false, error: "Unknown dataset." });
  }
  try {
    const { headers, rows } = await exportDataset(tenantId, dataset);
    const lines = [headers, ...rows].map((cols) => cols.map(csvCell).join(","));
    const csv = lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = storeSlug(await tenantNameById(tenantId));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}-${dataset}-${stamp}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("[account] export failed:", err);
    res.status(500).json({ ok: false, error: "Could not export that dataset." });
  }
});

// ── Danger zone (OWNER only) ──────────────────────────────────────────────────

accountRouter.post("/deactivate", requireRole("MERCHANT_OWNER"), async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return noTenant(res);
  const password = String((req.body as { password?: unknown })?.password ?? "");
  if (!password) {
    return res.status(400).json({ ok: false, error: "Confirm with your account password." });
  }
  try {
    const hash = await getPasswordHash(req.user!.userId);
    if (!hash) {
      return res.status(400).json({
        ok: false,
        error: "Set an account password first (Security) before deactivating your store.",
      });
    }
    if (!verifyPassword(password, hash)) {
      return res.status(401).json({ ok: false, error: "That password is incorrect." });
    }
    await deactivateStore(tenantId);
    // Every session for this tenant was just revoked (including this one); the
    // frontend logs out and redirects after a success here.
    res.json({ ok: true });
  } catch (err) {
    console.error("[account] deactivate failed:", err);
    res.status(500).json({ ok: false, error: "Could not deactivate your store." });
  }
});
