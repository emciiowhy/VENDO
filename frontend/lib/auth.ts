/**
 * Frontend auth client. Sign-in itself is a plain top-level navigation to the
 * backend (`/auth/google`) — the browser never handles a token. These helpers
 * cover the XHR seams around it: reading the current session, switching cashier
 * profiles by PIN, and logging out. All use `credentials: "include"` so the
 * secure HTTP-only session cookie rides along cross-origin.
 */
import { API_BASE_URL } from "./api";
import type { Tier } from "./tiers";

/** The href the "Sign in with Google" button points at. */
export const GOOGLE_SIGN_IN_URL = `${API_BASE_URL}/auth/google`;

export type Role = "SUPER_ADMIN" | "MERCHANT_OWNER" | "MANAGER" | "CASHIER";

/**
 * The store's subscription lifecycle (mirror of the backend's tenant.status).
 * 'trial' / 'active' are usable; 'trial_expired' routes the workspace to the
 * recovery view; 'suspended' can't sign in at all (so it's never seen here).
 */
export type TenantLifecycle = "trial" | "active" | "trial_expired" | "suspended";

export interface SessionUser {
  userId: string;
  tenantId: string | null;
  role: Role;
  email: string;
  name: string;
  /** Live store/business name from /auth/me (null for SUPER_ADMIN). */
  tenantName?: string | null;
  /** Owner-uploaded store logo URL from /auth/me (null when none / SUPER_ADMIN). */
  tenantLogoUrl?: string | null;
  /** The signed-in user's own uploaded profile photo from /auth/me (null when none). */
  avatarUrl?: string | null;
  /** The store's brand accent (#rrggbb) from /auth/me; null/undefined → default blue. */
  themeColor?: string | null;
  /**
   * The store's subscription TIER from /auth/me — the feature-gating level the
   * UI reads to hide premium controls. Null for the Super Admin (no store);
   * absent/null is treated as STARTER (most restrictive) by the gating helpers.
   */
  tier?: Tier | null;
  /**
   * The store's trial lifecycle from /auth/me, read live so a lapse trips the
   * recovery view on the next heartbeat. Null for the Super Admin (no store).
   */
  status?: TenantLifecycle | null;
  /** ISO timestamp the trial window ends/ended (for the recovery copy). */
  trialEndsAt?: string | null;
}

/** Human-readable copy for the `?error=` codes the backend redirects with. */
export const LOGIN_ERRORS: Record<string, string> = {
  auth_unconfigured: "Sign-in isn’t configured yet. Please contact your VendoPOS administrator.",
  google_denied: "Google sign-in was cancelled. Please try again.",
  bad_state: "Your sign-in session expired. Please try again.",
  missing_code: "Something went wrong with Google. Please try again.",
  email_unverified: "Your Google email isn’t verified. Verify it with Google and try again.",
  not_provisioned:
    "This account isn’t set up on VendoPOS yet. New here? Request a demo and our team will onboard you.",
  exchange_failed: "We couldn’t complete sign-in. Please try again in a moment.",
};

/**
 * The outcome of a /auth/me probe, kept richer than `SessionUser | null` so a
 * caller can tell three cases apart:
 *  • `authed`   — a live session; `user` carries the ground-truth tier/identity.
 *  • `unauthed` — the server confirmed there is no session (401 / ok:false).
 *  • `error`    — the server was unreachable or replied unparseably.
 *
 * Background revalidation leans on this distinction: an `error` is a transient
 * blip that must NOT tear down an already-established session, whereas only an
 * `unauthed` should bounce the operator to /login. See useSession.
 */
export type SessionProbe =
  | { status: "authed"; user: SessionUser }
  | { status: "unauthed" }
  | { status: "error" };

export async function fetchSession(): Promise<SessionProbe> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: "include" });
    if (res.status === 401) return { status: "unauthed" };
    if (!res.ok) return { status: "error" };
    const data = (await res.json()) as { ok: boolean; user?: SessionUser };
    if (data.ok && data.user) return { status: "authed", user: data.user };
    return { status: "unauthed" };
  } catch {
    return { status: "error" };
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const probe = await fetchSession();
  return probe.status === "authed" ? probe.user : null;
}

export interface Store {
  id: string;
  name: string;
  slug: string;
}

export type StoreLookupResult =
  | { ok: true; store: Store }
  | { ok: false; error: string };

/**
 * Resolve a Store ID (slug) before a cold-terminal cashier enters their PIN.
 * No credentials needed — this only confirms the store exists and names it.
 */
export async function lookupStore(storeId: string): Promise<StoreLookupResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    return (await res.json()) as StoreLookupResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export type PinResult =
  | { ok: true; user: SessionUser; redirectTo: string }
  | { ok: false; error: string };

/**
 * Owner/manager password sign-in: Store ID + email + password. The Store ID
 * scopes the lookup to one tenant; the backend collapses every failure into one
 * generic message. On success it sets the session cookie and returns where to go.
 */
export async function passwordLogin(input: {
  storeId: string;
  email: string;
  password: string;
}): Promise<PinResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/password-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    return (await res.json()) as PinResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export type PasswordActionResult =
  | { ok: true }
  | { ok: false; error?: string; errors?: Record<string, string> };

/** Whether the signed-in owner/manager already has a password set. */
export async function getPasswordStatus(): Promise<
  { ok: true; hasPassword: boolean } | { ok: false; error: string }
> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/password/status`, { credentials: "include" });
    return (await res.json()) as { ok: true; hasPassword: boolean } | { ok: false; error: string };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

/** Set or change the signed-in owner/manager's password. `currentPassword` is required once one is set. */
export async function setPassword(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<PasswordActionResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    return (await res.json()) as PasswordActionResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

/**
 * Switch into a cashier session by PIN.
 *  • `storeId` — cold login terminal: which store's cashiers to check against.
 *  • `userId`  — warm terminal: the cashier pre-selected in the switch selector,
 *    so a colliding PIN can't switch into the wrong profile.
 */
export async function switchByPin(
  pin: string,
  opts: { storeId?: string; userId?: string } = {},
): Promise<PinResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin, ...opts }),
    });
    const data = (await res.json()) as PinResult;
    return data;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

/** A store's active cashier profiles (id + name) for the forgot-PIN picker. */
export async function listStoreCashiers(
  opts: { storeId?: string } = {},
): Promise<{ ok: true; cashiers: { id: string; name: string }[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/cashiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(opts),
    });
    return (await res.json()) as
      | { ok: true; cashiers: { id: string; name: string }[] }
      | { ok: false; error: string };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

/** Raise a PIN-reset request for the owner to action (cashier forgot their PIN). */
export async function requestPinReset(
  cashierId: string,
  opts: { storeId?: string } = {},
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/pin/forgot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ cashierId, ...opts }),
    });
    return (await res.json()) as { ok: true; message: string } | { ok: false; error: string };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

export type ImpersonateResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

/**
 * Super-Admin only: open a subscriber's owner dashboard by minting a session as
 * that Tenant's owner. The backend swaps the session cookie, so the caller must
 * do a full-page navigation to `redirectTo` (window.location) — that reload also
 * resets the cached session in useSession, so the owner identity is picked up
 * cleanly. Signing out afterwards returns to /login to sign back in as admin.
 */
export async function impersonateTenant(tenantId: string): Promise<ImpersonateResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/impersonate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tenantId }),
    });
    return (await res.json()) as ImpersonateResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export type SignupPlan = "starter" | "business";

export type SignupResult =
  | { ok: true; user: SessionUser; redirectTo: string }
  | { ok: false; error?: string; errors?: Record<string, string> };

/**
 * Self-service signup from the pricing page. On success the backend has already
 * provisioned the tenant and set the session cookie, so the caller should do a
 * full-page navigation to `redirectTo` (window.location) — that reload also
 * resets the cached session in useSession, so the new owner identity is picked
 * up cleanly, exactly like the password-login path.
 */
export async function signUp(input: {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  plan: SignupPlan;
}): Promise<SignupResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    return (await res.json()) as SignupResult;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    /* best-effort */
  }
}
