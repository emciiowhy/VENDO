import { query } from "../db.js";
import { verifyPin } from "./auth.crypto.js";
import type { Role, Session } from "./auth.types.js";

/**
 * Authorization data access. Google hands us a verified email; everything that
 * follows — whether this person may enter at all, which Tenant they belong to,
 * and what role they hold — is decided here, against our own rows. There is no
 * self-serve sign-up: an email with no matching active `users` row is turned
 * away (the Super Admin provisions Tenants and their staff manually).
 */

interface AccountRow {
  id: string;
  tenant_id: string | null;
  email: string;
  name: string;
  role: Role;
  status: string;
}

/**
 * Look up an authenticatable account by email. Returns null when the email is
 * unknown or the account/Tenant is not active — the caller turns that into a
 * clean "not provisioned" rejection rather than minting a session.
 */
export async function findAccountByEmail(email: string): Promise<Session | null> {
  const { rows } = await query<AccountRow>(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.status
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE u.email = $1
        AND u.status = 'active'
        AND (u.tenant_id IS NULL OR t.status = 'active')
      LIMIT 1`,
    [email.toLowerCase()],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.id,
    tenantId: row.tenant_id,
    role: row.role,
    email: row.email,
    name: row.name,
  };
}

/**
 * The MERCHANT_OWNER session for a Tenant — used by Super-Admin impersonation
 * to open a store's owner dashboard. A freshly provisioned merchant can't be
 * reached any other way: Google sign-in needs the owner's own account and the
 * PIN path is cashier-only. Scoped to an active owner inside an active Tenant
 * (the oldest, if a store somehow has more than one); null when there is no
 * owner to open. Mirrors the owner pick in the subscriber directory query.
 */
export async function findTenantOwnerSession(tenantId: string): Promise<Session | null> {
  const { rows } = await query<AccountRow>(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.status
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.tenant_id = $1
        AND u.role = 'MERCHANT_OWNER'
        AND u.status = 'active'
        AND t.status = 'active'
      ORDER BY u.created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.id,
    tenantId: row.tenant_id,
    role: row.role,
    email: row.email,
    name: row.name,
  };
}

/**
 * Look up an OWNER/MANAGER in one Tenant by email, returning their session plus
 * the stored password hash for verification. Scoped to an active account inside
 * an active Tenant; CASHIER/SUPER_ADMIN are excluded — only store managers sign
 * in with a password. Returns null when there's no such account (the caller
 * collapses "not found" and "wrong password" into one generic rejection).
 */
export async function findManagerForPasswordLogin(
  tenantId: string,
  email: string,
): Promise<{ session: Session; passwordHash: string | null } | null> {
  const { rows } = await query<AccountRow & { password_hash: string | null }>(
    `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.status, u.password_hash
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.tenant_id = $1
        AND lower(u.email) = lower($2)
        AND u.role IN ('MERCHANT_OWNER', 'MANAGER')
        AND u.status = 'active'
        AND t.status = 'active'
      LIMIT 1`,
    [tenantId, email],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    session: {
      userId: row.id,
      tenantId: row.tenant_id,
      role: row.role,
      email: row.email,
      name: row.name,
    },
    passwordHash: row.password_hash,
  };
}

/** The stored password hash for a user (null when none set). Used to gate changes. */
export async function getPasswordHash(userId: string): Promise<string | null> {
  const { rows } = await query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.password_hash ?? null;
}

/** Set (or replace) a user's password hash. */
export async function setPasswordHash(userId: string, hash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolve a Tenant by its Store ID (the public `slug`). Used to scope the
 * shared-terminal cashier PIN flow on a cold login screen: the cashier types
 * the Store ID, we confirm an active store exists, then check the PIN strictly
 * within it. The slug is not a secret (it shows up in branding/URLs) — the PIN
 * remains the only credential. Returns null for unknown or suspended stores.
 */
export async function findTenantBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const { rows } = await query<TenantRow>(
    `SELECT id, name, slug
       FROM tenants
      WHERE lower(slug) = lower($1)
        AND status = 'active'
      LIMIT 1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** The active store's display name for a tenant id (null for SUPER_ADMIN). */
export async function tenantNameById(tenantId: string): Promise<string | null> {
  const { rows } = await query<{ name: string }>(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
  return rows[0]?.name ?? null;
}

/** The store's brand (name + logo + accent colour) for the dashboard chrome. */
export async function tenantBrandById(
  tenantId: string,
): Promise<{ name: string | null; logoUrl: string | null; themeColor: string | null }> {
  const { rows } = await query<{ name: string; logo_url: string | null; theme_color: string | null }>(
    `SELECT name, logo_url, theme_color FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return {
    name: rows[0]?.name ?? null,
    logoUrl: rows[0]?.logo_url ?? null,
    themeColor: rows[0]?.theme_color ?? null,
  };
}

/** The signed-in user's uploaded avatar URL (null when none) for the dashboard chrome. */
export async function userAvatarById(userId: string): Promise<string | null> {
  const { rows } = await query<{ avatar_url: string | null }>(
    `SELECT avatar_url FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.avatar_url ?? null;
}

/** Record a successful sign-in: stamp last login and remember the Google subject. */
export async function recordLogin(userId: string, googleSub: string): Promise<void> {
  await query(
    `UPDATE users SET last_login_at = now(), google_sub = COALESCE(google_sub, $2) WHERE id = $1`,
    [userId, googleSub],
  );
}

// ── Device sessions + login audit ───────────────────────────────────────────

export type LoginMethod = "google" | "password" | "pin" | "impersonate";

export interface LoginContext {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Open a device session for a fresh sign-in and append a login-audit row in one
 * round-trip. Returns the new session id (`sid`) to bake into the JWT so the
 * stateless cookie maps back to this revocable record. Best-effort: a failure
 * here must never block the login itself, so callers wrap it and fall back to a
 * sid-less token (still valid, just not individually revocable).
 */
export async function startSession(
  session: Session,
  method: LoginMethod,
  ctx: LoginContext,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO sessions (user_id, tenant_id, method, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [session.userId, session.tenantId, method, ctx.ip, ctx.userAgent],
  );
  const sid = rows[0].id;
  await query(
    `INSERT INTO login_events (user_id, tenant_id, method, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.userId, session.tenantId, method, ctx.ip, ctx.userAgent],
  );
  return sid;
}

/**
 * Validate the session a token claims (`sid`) for the auth middleware. Returns
 * false when the row is missing or revoked — which turns a still-unexpired
 * cookie into a 401, the mechanism behind per-device revoke. On a valid hit it
 * fire-and-forget bumps `last_seen_at` (throttled to ~2 min) so the device list
 * shows recency without a write on every single request.
 */
export async function isSessionValid(sid: string): Promise<boolean> {
  const { rows } = await query<{ revoked_at: Date | null }>(
    `SELECT revoked_at FROM sessions WHERE id = $1`,
    [sid],
  );
  const row = rows[0];
  if (!row || row.revoked_at) return false;
  void query(
    `UPDATE sessions SET last_seen_at = now()
      WHERE id = $1 AND last_seen_at < now() - interval '120 seconds'`,
    [sid],
  ).catch(() => {});
  return true;
}

/** Revoke a single session row (used by logout to drop the current device). */
export async function revokeSession(sid: string): Promise<void> {
  await query(
    `UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [sid],
  );
}

interface CashierRow {
  id: string;
  tenant_id: string;
  name: string;
  pin_hash: string | null;
  status: string;
}

/**
 * Verify a 4-digit cashier PIN within a single Tenant and return that cashier's
 * session. Scoped strictly to `tenantId` — taken from the manager/owner session
 * already active on the shared terminal — so a PIN can never cross Tenants.
 */
export async function findCashierByPin(
  tenantId: string,
  pin: string,
  userId?: string | null,
): Promise<Session | null> {
  // When the terminal switcher pre-selects a profile, scope the check to that
  // cashier so colliding PINs can't switch into the wrong person.
  const { rows } = await query<CashierRow>(
    `SELECT id, tenant_id, name, pin_hash, status
       FROM users
      WHERE tenant_id = $1
        AND role = 'CASHIER'
        AND status = 'active'
        AND pin_hash IS NOT NULL
        AND ($2::uuid IS NULL OR id = $2)`,
    [tenantId, userId ?? null],
  );
  for (const row of rows) {
    if (verifyPin(pin, row.pin_hash)) {
      return {
        userId: row.id,
        tenantId: row.tenant_id,
        role: "CASHIER",
        email: "",
        name: row.name,
      };
    }
  }
  return null;
}
