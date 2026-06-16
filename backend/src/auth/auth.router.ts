import { Router } from "express";
import { env } from "../env.js";
import { hashPassword, randomState, sign, unsign, verifyPassword } from "./auth.crypto.js";
import {
  buildConsentUrl,
  googleConfigured,
  profileFromCode,
} from "./auth.google.js";
import { signSession } from "./auth.jwt.js";
import {
  findAccountByEmail,
  findCashierByPin,
  findManagerForPasswordLogin,
  findTenantBySlug,
  findTenantOwnerSession,
  getPasswordHash,
  recordLogin,
  revokeSession,
  setPasswordHash,
  startSession,
  tenantBrandById,
  tenantTierById,
  userAvatarById,
  type LoginMethod,
} from "./auth.repository.js";
import type { Tier } from "../lib/tiers.js";
import { evaluateTenantStatus, type TenantLifecycle } from "../billing/trial.js";
import { createPinRequest, listActiveCashiers } from "../staff/staff.repository.js";
import { signUpMerchant, type SignupPlan } from "./signup.repository.js";
import {
  clearSessionCookie,
  clientContext,
  requireAuth,
  requireRole,
  sessionFromRequest,
  setSessionCookie,
} from "./auth.middleware.js";
import { dashboardPathForRole, type Session } from "./auth.types.js";

/**
 * Mint a tracked session and drop the cookie. Opening a `sessions` row (and the
 * login-audit row) is best-effort: if it fails we still sign the user in with a
 * sid-less token — valid, just not individually revocable — so a logging hiccup
 * never blocks a legitimate login.
 */
async function issueSession(
  res: import("express").Response,
  req: import("express").Request,
  session: Session,
  method: LoginMethod,
): Promise<void> {
  let sid: string | undefined;
  try {
    sid = await startSession(session, method, clientContext(req));
  } catch (err) {
    console.error("[auth] could not open session row:", err);
  }
  setSessionCookie(res, signSession({ ...session, sid }));
}

export const authRouter = Router();

const STATE_COOKIE = "vendopos_oauth_state";
const STATE_MAX_AGE_MS = 1000 * 60 * 10; // 10 minutes to complete the dance

/** Bounce the browser to the frontend /login with a machine-readable reason. */
function failToLogin(res: import("express").Response, reason: string): void {
  const url = new URL("/login", env.frontendUrl);
  url.searchParams.set("error", reason);
  res.redirect(url.toString());
}

/**
 * GET /auth/google — kick off the OAuth dance.
 *
 * Mints a CSRF `state` nonce, stashes a signed copy in a short-lived HTTP-only
 * cookie, and redirects to the Google consent screen. Next.js links here
 * directly (a plain anchor), so the whole flow is top-level navigation and the
 * client never touches a token.
 */
authRouter.get("/google", (req, res) => {
  if (!googleConfigured()) {
    return failToLogin(res, "auth_unconfigured");
  }
  const state = randomState();
  res.cookie(STATE_COOKIE, sign(state), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: STATE_MAX_AGE_MS,
  });
  res.redirect(buildConsentUrl(state));
});

/**
 * GET /auth/google/callback — Google sends the user back here with `code` and
 * the same `state`. We verify state (CSRF), exchange the code for the profile,
 * look the email up in our own rows, and — only if it resolves to an active
 * account — sign the application JWT and drop it in the secure session cookie.
 * Then we redirect to the role-specific dashboard.
 */
authRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error) return failToLogin(res, "google_denied");
  if (!googleConfigured()) return failToLogin(res, "auth_unconfigured");

  // CSRF: the state echoed by Google must match our signed cookie, then burn it.
  const cookieState = unsign(
    (req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE],
  );
  res.clearCookie(STATE_COOKIE, { path: "/" });
  if (!state || !cookieState || state !== cookieState) {
    return failToLogin(res, "bad_state");
  }
  if (!code) return failToLogin(res, "missing_code");

  try {
    const profile = await profileFromCode(code);
    if (!profile.emailVerified) return failToLogin(res, "email_unverified");

    const account = await findAccountByEmail(profile.email);
    if (!account) {
      // Known person, but no provisioned account — Leads have no credentials.
      return failToLogin(res, "not_provisioned");
    }

    await recordLogin(account.userId, profile.sub);
    await issueSession(res, req, account, "google");

    const dest = new URL(dashboardPathForRole(account.role), env.frontendUrl);
    return res.redirect(dest.toString());
  } catch (err) {
    console.error("[auth] google callback failed:", err);
    return failToLogin(res, "exchange_failed");
  }
});

/**
 * GET /auth/me — who is the current session? The frontend uses this to decide
 * whether to show a dashboard or bounce back to /login. Returns 401 when there
 * is no valid session.
 */
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = req.user!;
  // Enrich with live DB values — the store name/logo and the user's own avatar —
  // so a rename or a freshly-uploaded photo shows without a re-login, while the
  // tenant id stays the only thing trusted from the JWT.
  let tenantName: string | null = null;
  let tenantLogoUrl: string | null = null;
  let themeColor: string | null = null;
  let avatarUrl: string | null = null;
  // The store's feature-gating tier, read live so an upgrade/downgrade reflects
  // in the workspace on the next /auth/me without a re-login. Null for the
  // Super Admin (no tenant); the frontend treats absent tier as STARTER.
  let tier: Tier | null = null;
  // The store's trial lifecycle, also read live: evaluating it here applies the
  // lazy lapse, so the workspace's /auth/me heartbeat is what trips a trial to
  // `trial_expired` and swaps the UI to the recovery view (no re-login needed).
  let status: TenantLifecycle | null = null;
  let trialEndsAt: string | null = null;
  try {
    const [brand, avatar, tenantTier, lifecycle] = await Promise.all([
      user.tenantId ? tenantBrandById(user.tenantId) : Promise.resolve(null),
      userAvatarById(user.userId),
      user.tenantId ? tenantTierById(user.tenantId) : Promise.resolve(null),
      user.tenantId ? evaluateTenantStatus(user.tenantId) : Promise.resolve(null),
    ]);
    if (brand) {
      tenantName = brand.name;
      tenantLogoUrl = brand.logoUrl;
      themeColor = brand.themeColor;
    }
    avatarUrl = avatar;
    tier = tenantTier;
    if (lifecycle) {
      status = lifecycle.status;
      trialEndsAt = lifecycle.trialEndsAt;
    }
  } catch (err) {
    console.error("[auth] session enrichment failed:", err);
  }
  res.json({
    ok: true,
    user: { ...user, tenantName, tenantLogoUrl, themeColor, avatarUrl, tier, status, trialEndsAt },
  });
});

/** POST /auth/logout — revoke this device's session row and drop the cookie. */
authRouter.post("/logout", async (req, res) => {
  const session = sessionFromRequest(req);
  if (session?.sid) {
    try {
      await revokeSession(session.sid);
    } catch (err) {
      console.error("[auth] logout revoke failed:", err);
    }
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ── Owner / Manager password sign-in ────────────────────────────────────────
// A store manager can set a password (self-service, from the dashboard) and then
// sign in with Store ID + email + password instead of Google. Cashiers (PIN) and
// the Super Admin are excluded from this path.

const MIN_PASSWORD_LENGTH = 8;

/**
 * POST /auth/password-login — Store ID + email + password for an owner/manager.
 * The Store ID scopes the lookup to one Tenant; the email picks the account
 * within it. Not-found, no-password and wrong-password all collapse into one
 * generic message so the form can't be used to probe which emails exist.
 */
authRouter.post("/password-login", async (req, res) => {
  const body = req.body as { storeId?: unknown; email?: unknown; password?: unknown };
  const storeId = String(body?.storeId ?? "").trim().toLowerCase();
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");

  if (!storeId || !email || !password) {
    return res.status(400).json({ ok: false, error: "Enter your Store ID, email and password." });
  }

  const invalid = () =>
    res.status(401).json({ ok: false, error: "Incorrect Store ID, email or password." });

  try {
    const store = await findTenantBySlug(storeId);
    if (!store) return invalid();

    const found = await findManagerForPasswordLogin(store.id, email);
    if (!found || !verifyPassword(password, found.passwordHash)) return invalid();

    await issueSession(res, req, found.session, "password");
    return res.json({
      ok: true,
      user: found.session,
      redirectTo: dashboardPathForRole(found.session.role),
    });
  } catch (err) {
    console.error("[auth] password login failed:", err);
    return res.status(500).json({ ok: false, error: "Could not sign you in. Try again." });
  }
});

// ── Self-service signup ─────────────────────────────────────────────────────
// A prospect creates their own store from the pricing page (Starter/Business)
// and is signed straight in on a 14-day trial. Enterprise is contact-sales only,
// so it never reaches here. Distinct from the operator-driven lead promotion.

const SIGNUP_PLANS = new Set<SignupPlan>(["starter", "business"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /auth/signup — { businessName, ownerName, email, password, plan }.
 * Validates the form, atomically provisions a fresh isolated tenant + owner +
 * seeded demo workspace, then issues the owner's session cookie so there's zero
 * friction into the dashboard. Field-level errors come back in `errors`.
 */
authRouter.post("/signup", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const businessName = String(body?.businessName ?? "").trim();
  const ownerName = String(body?.ownerName ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  const planRaw = String(body?.plan ?? "starter").trim().toLowerCase();
  const plan: SignupPlan = SIGNUP_PLANS.has(planRaw as SignupPlan)
    ? (planRaw as SignupPlan)
    : "starter";

  const errors: Record<string, string> = {};
  if (businessName.length < 2) errors.businessName = "Enter your business name.";
  if (ownerName.length < 2) errors.ownerName = "Enter your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, errors });
  }

  try {
    const result = await signUpMerchant({ businessName, ownerName, email, password, plan });
    if (!result.ok) {
      return res.status(409).json({
        ok: false,
        errors: { email: "An account with this email already exists — try signing in instead." },
      });
    }
    await issueSession(res, req, result.session, "password");
    return res.json({
      ok: true,
      user: result.session,
      redirectTo: dashboardPathForRole(result.session.role),
    });
  } catch (err) {
    console.error("[auth] signup failed:", err);
    return res.status(500).json({ ok: false, error: "Could not create your account. Please try again." });
  }
});

/** GET /auth/password/status — whether the signed-in manager has a password set. */
authRouter.get("/password/status", requireRole("MERCHANT_OWNER", "MANAGER"), async (req, res) => {
  try {
    const hash = await getPasswordHash(req.user!.userId);
    return res.json({ ok: true, hasPassword: hash !== null });
  } catch (err) {
    console.error("[auth] password status failed:", err);
    return res.status(500).json({ ok: false, error: "Could not load your security settings." });
  }
});

/**
 * POST /auth/password — the signed-in owner/manager sets or changes their own
 * password. When one is already set, the current password must be supplied and
 * verified; the first time (Google-only account) it can be set without one.
 */
authRouter.post("/password", requireRole("MERCHANT_OWNER", "MANAGER"), async (req, res) => {
  const body = req.body as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = body?.currentPassword === undefined ? "" : String(body.currentPassword);
  const newPassword = String(body?.newPassword ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      ok: false,
      errors: { newPassword: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
    });
  }

  try {
    const existing = await getPasswordHash(req.user!.userId);
    if (existing) {
      if (!verifyPassword(currentPassword, existing)) {
        return res
          .status(400)
          .json({ ok: false, errors: { currentPassword: "Current password is incorrect." } });
      }
    }
    await setPasswordHash(req.user!.userId, hashPassword(newPassword));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[auth] set password failed:", err);
    return res.status(500).json({ ok: false, error: "Could not update your password." });
  }
});

/**
 * POST /auth/impersonate — the Super Admin opens a subscriber's owner dashboard.
 *
 * Provisioning a merchant creates their owner row, but the platform admin has no
 * other way to *see* that store: Google sign-in would need the owner's own
 * account, and the PIN path is cashier-only. This mints a session as the
 * Tenant's owner and returns the dashboard path the caller should navigate to.
 *
 * SUPER_ADMIN only, and the swap is logged for the audit trail. Because it
 * replaces the admin's own session cookie with the owner's, returning to the
 * platform console means signing out and back in as the admin — the frontend
 * makes that clear before it opens the store.
 */
authRouter.post("/impersonate", requireRole("SUPER_ADMIN"), async (req, res) => {
  const body = req.body as { tenantId?: unknown };
  const tenantId =
    typeof body?.tenantId === "string" && /^[0-9a-f-]{36}$/i.test(body.tenantId)
      ? body.tenantId
      : null;
  if (!tenantId) {
    return res.status(400).json({ ok: false, error: "Choose a store to open." });
  }
  try {
    const owner = await findTenantOwnerSession(tenantId);
    if (!owner) {
      return res
        .status(404)
        .json({ ok: false, error: "This store has no active owner to open yet." });
    }
    const admin = req.user!;
    console.info(
      `[auth] SUPER_ADMIN ${admin.userId} impersonating tenant ${tenantId} as owner ${owner.userId}`,
    );
    await issueSession(res, req, owner, "impersonate");
    return res.json({ ok: true, redirectTo: dashboardPathForRole(owner.role) });
  } catch (err) {
    console.error("[auth] impersonate failed:", err);
    return res.status(500).json({ ok: false, error: "Could not open that store." });
  }
});

/**
 * POST /auth/store — resolve a Store ID (slug) so a cashier on a cold terminal
 * can identify their store before entering a PIN. Public and unauthenticated:
 * the slug isn't a secret, and the PIN check that follows is the real gate.
 */
authRouter.post("/store", async (req, res) => {
  const storeId = String((req.body as { storeId?: unknown })?.storeId ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(storeId)) {
    return res.status(400).json({ ok: false, error: "Enter your Store ID." });
  }
  try {
    const store = await findTenantBySlug(storeId);
    if (!store) {
      return res.status(404).json({ ok: false, error: "We couldn’t find that Store ID." });
    }
    return res.json({ ok: true, store });
  } catch (err) {
    console.error("[auth] store lookup failed:", err);
    return res.status(500).json({ ok: false, error: "Couldn’t look up that store. Try again." });
  }
});

/**
 * POST /auth/pin — the shared-terminal cashier switch.
 *
 * Two entry points, one rule: the PIN is always checked strictly within a
 * single Tenant.
 *  • Warm terminal — a manager/owner is already signed in via Google, so an
 *    active Tenant session decides the scope.
 *  • Cold terminal (login screen) — no session yet, so the cashier first typed
 *    a Store ID; we resolve that to the Tenant and scope to it.
 * An active session's Tenant always wins, so a typed Store ID can never be used
 * to reach across into another Tenant's cashiers.
 */
authRouter.post("/pin", async (req, res) => {
  const active = sessionFromRequest(req);
  const body = req.body as { pin?: unknown; storeId?: unknown; userId?: unknown };

  const pin = String(body?.pin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ ok: false, error: "Enter your 4-digit PIN." });
  }
  // Optional pre-selected cashier from the switch selector (validated as a UUID
  // shape; the query treats a non-match as no cashier found).
  const selectedId =
    typeof body?.userId === "string" && /^[0-9a-f-]{36}$/i.test(body.userId) ? body.userId : null;

  try {
    let tenantId = active?.tenantId ?? null;
    if (!tenantId) {
      const slug = String(body?.storeId ?? "").trim().toLowerCase();
      const store = slug ? await findTenantBySlug(slug) : null;
      tenantId = store?.id ?? null;
    }
    if (!tenantId) {
      return res.status(401).json({ ok: false, error: "Identify your store first." });
    }

    const cashier = await findCashierByPin(tenantId, pin, selectedId);
    if (!cashier) {
      return res.status(401).json({ ok: false, error: "Incorrect PIN." });
    }
    await issueSession(res, req, cashier, "pin");
    return res.json({
      ok: true,
      user: cashier,
      redirectTo: dashboardPathForRole(cashier.role),
    });
  } catch (err) {
    console.error("[auth] pin switch failed:", err);
    return res.status(500).json({ ok: false, error: "Could not switch profiles." });
  }
});

/**
 * Resolve the Tenant for a PIN-flow request: an active session's Tenant always
 * wins (warm terminal); otherwise fall back to a resolved Store ID (cold login).
 * Mirrors the /auth/pin rule so a typed Store ID can't reach across Tenants.
 */
async function tenantForPinFlow(req: import("express").Request): Promise<string | null> {
  const active = sessionFromRequest(req);
  if (active?.tenantId) return active.tenantId;
  const slug = String((req.body as { storeId?: unknown })?.storeId ?? "").trim().toLowerCase();
  const store = slug ? await findTenantBySlug(slug) : null;
  return store?.id ?? null;
}

/**
 * POST /auth/cashiers — list a store's active cashiers (id + name) so the
 * forgot-PIN picker can name them. Public: scoped to a single resolved Tenant,
 * names only (no PIN material), and the store is physically present at the till.
 */
authRouter.post("/cashiers", async (req, res) => {
  try {
    const tenantId = await tenantForPinFlow(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "Identify your store first." });
    return res.json({ ok: true, cashiers: await listActiveCashiers(tenantId) });
  } catch (err) {
    console.error("[auth] cashier list failed:", err);
    return res.status(500).json({ ok: false, error: "Could not load cashiers." });
  }
});

/**
 * POST /auth/pin/forgot — a cashier who forgot their PIN raises a reset request
 * for the owner to action. Body: `{ cashierId, storeId? }`. Idempotent.
 */
authRouter.post("/pin/forgot", async (req, res) => {
  const body = req.body as { cashierId?: unknown };
  const cashierId =
    typeof body?.cashierId === "string" && /^[0-9a-f-]{36}$/i.test(body.cashierId)
      ? body.cashierId
      : null;
  if (!cashierId) return res.status(400).json({ ok: false, error: "Choose your cashier profile." });

  try {
    const tenantId = await tenantForPinFlow(req);
    if (!tenantId) return res.status(401).json({ ok: false, error: "Identify your store first." });
    const result = await createPinRequest(tenantId, cashierId);
    if (!result.ok) return res.status(404).json({ ok: false, error: "That cashier profile wasn’t found." });
    return res.json({
      ok: true,
      message: result.created
        ? "Your manager has been notified to reset your PIN."
        : "A reset request is already pending with your manager.",
    });
  } catch (err) {
    console.error("[auth] pin forgot failed:", err);
    return res.status(500).json({ ok: false, error: "Could not submit your request." });
  }
});
