import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { verifySession } from "./auth.jwt.js";
import { isSessionValid } from "./auth.repository.js";
import type { Role, Session } from "./auth.types.js";

/**
 * Reading and writing the secure session cookie, plus the guard that protects
 * authenticated routes. The cookie is HTTP-only (never readable by JS),
 * SameSite=Lax (so it survives the top-level OAuth redirect back from Google
 * while still resisting cross-site POSTs), and Secure in production.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Session;
    }
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.session.cookieName, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    domain: env.session.cookieDomain,
    path: "/",
    maxAge: env.session.maxAgeMs,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.session.cookieName, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    domain: env.session.cookieDomain,
    path: "/",
  });
}

/** Resolve the current session from the cookie, or null. */
export function sessionFromRequest(req: Request): Session | null {
  const token = (req.cookies as Record<string, string> | undefined)?.[env.session.cookieName];
  return verifySession(token);
}

/** Best-effort client IP + user agent for session/login auditing. */
export function clientContext(req: Request): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (typeof fwd === "string" ? fwd.split(",")[0]?.trim() : Array.isArray(fwd) ? fwd[0] : null) ||
    req.socket?.remoteAddress ||
    null;
  const ua = req.headers["user-agent"];
  return { ip: ip || null, userAgent: typeof ua === "string" ? ua : null };
}

/**
 * Confirm a verified token still maps to a live (non-revoked) device session.
 * Legacy tokens carry no `sid` and pass unconditionally (they expire on their
 * own). On a DB error we fail OPEN — a transient outage must not lock everyone
 * out — and only deny when the row is positively missing or revoked. Returns
 * true to proceed, false when the caller should reject with 401.
 */
async function sessionStillLive(session: Session): Promise<boolean> {
  if (!session.sid) return true;
  try {
    return await isSessionValid(session.sid);
  } catch (err) {
    console.error("[auth] session validity check failed (failing open):", err);
    return true;
  }
}

/** Guard: rejects with 401 unless a valid, non-revoked session cookie is present. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = sessionFromRequest(req);
  if (!session) {
    res.status(401).json({ ok: false, error: "Not authenticated." });
    return;
  }
  if (!(await sessionStillLive(session))) {
    clearSessionCookie(res);
    res.status(401).json({ ok: false, error: "Your session has ended. Please sign in again." });
    return;
  }
  req.user = session;
  next();
}

/**
 * Guard: requires a valid session whose role is in `roles`. Used to fence the
 * inventory routes to store staff (MERCHANT_OWNER / MANAGER) — the Super Admin
 * has no tenant scope, and cashiers don't manage the catalog.
 */
export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const session = sessionFromRequest(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Not authenticated." });
      return;
    }
    if (!roles.includes(session.role)) {
      res.status(403).json({ ok: false, error: "You don’t have access to this." });
      return;
    }
    if (!(await sessionStillLive(session))) {
      clearSessionCookie(res);
      res.status(401).json({ ok: false, error: "Your session has ended. Please sign in again." });
      return;
    }
    req.user = session;
    next();
  };
}
