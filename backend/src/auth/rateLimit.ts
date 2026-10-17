import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";

/**
 * Brute-force / abuse throttles for the public-facing seams.
 *
 * The register's cashier PIN is only 4 digits (10,000 combinations) and the
 * owner/manager password-login and self-service signup are all unauthenticated,
 * so without a throttle a script could sweep credentials or spam the lead/signup
 * forms. We rate-limit per client IP; there is deliberately NO per-account or
 * per-tenant lockout, because the PIN check matches against every cashier in a
 * store — a tenant-scoped lock would let an attacker lock out a whole store's
 * tills (a DoS), and an email-scoped lock would let them freeze a known owner.
 * Blocking the offending IP stops the sweep without punishing the victim.
 */

/** Shared JSON 429 so a throttled client gets our standard error shape. */
function tooMany(message: string): Partial<Options> {
  return {
    standardHeaders: true, // RateLimit-* headers
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ ok: false, error: message });
    },
  };
}

/**
 * Credential endpoints (PIN switch, password login, signup, forgot-PIN).
 * `skipSuccessfulRequests` means a legitimate operator who signs in cleanly
 * never burns the budget — only FAILED attempts count toward the limit, so the
 * window only bites a client that is actually guessing.
 */
export const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  skipSuccessfulRequests: true,
  ...tooMany("Too many attempts. Wait a few minutes and try again."),
});

/** Lead capture + public contact forms — spam/flood control (counts all hits). */
export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 30,
  ...tooMany("Too many submissions. Please try again later."),
});

/**
 * Manufacturing recipe assistant — a cheap in-process lookup, capped per STORE
 * (tenant from the verified session) only as general abuse control. Mounted
 * after auth, so `req.user` is always set; the IP fallback is a safety net.
 */
export const recipeAssistantLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 120,
  keyGenerator: (req) =>
    req.user?.tenantId ? `tenant:${req.user.tenantId}` : ipKeyGenerator(req.ip ?? "0.0.0.0"),
  ...tooMany("You've used the recipe assistant a lot this hour. Try again later."),
});
