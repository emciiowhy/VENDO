import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";

/**
 * Origin-based CSRF guard for state-changing requests.
 *
 * The session cookie is `SameSite=None` in production (the frontend and API sit
 * on different origins behind a same-origin proxy), so the browser attaches it
 * to cross-site requests too. CORS stops an attacker from *reading* a response,
 * and the `application/json` preflight stops most forged writes — but a forged
 * request that needs no JSON body (e.g. `POST /auth/logout`) slips through. This
 * guard closes that gap the standard way: for every mutating method, the
 * request's `Origin` (or `Referer` as a fallback) must match the same allowlist
 * CORS already trusts. A forged cross-site write carries the attacker's origin
 * and is rejected; a genuine first-party call carries ours and passes.
 *
 * Fail-open ONLY when neither header is present: a browser always sends `Origin`
 * on a cross-origin state-changing request, so "neither header" never describes
 * a browser-driven CSRF — it describes a non-browser client, an internal probe,
 * or a proxy that stripped both headers. Rejecting those would risk breaking
 * legitimate traffic without closing any real browser attack, so we allow them.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function originAllowed(value: string): boolean {
  return env.corsOrigins.includes(value);
}

export function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const deny = () => {
    res.status(403).json({ ok: false, error: "Cross-site request blocked." });
  };

  // Prefer Origin — it's present on every cross-origin state-changing request
  // and cannot be forged or suppressed by the attacker's page.
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    return originAllowed(origin) ? next() : deny();
  }

  // No Origin (some same-origin requests omit it) — fall back to the Referer's
  // origin, which same-site navigations still carry.
  const referer = req.headers.referer;
  if (typeof referer === "string" && referer.length > 0) {
    try {
      return originAllowed(new URL(referer).origin) ? next() : deny();
    } catch {
      return deny();
    }
  }

  // Neither header present — not a browser-driven CSRF (see note above).
  return next();
}
