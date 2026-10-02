import "dotenv/config";

/**
 * Centralised, validated access to environment configuration.
 * Fails fast at startup if something required is missing.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy backend/.env.example to backend/.env and fill it in.`,
    );
  }
  return value.trim();
}

/** Optional read with a fallback — for config that only some features need. */
function optional(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

const port = Number(process.env.PORT ?? 4000);
const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isProd = (process.env.NODE_ENV ?? "development") === "production";

/**
 * The JWT/session-signing secret. In PRODUCTION it is mandatory and must be long
 * enough to resist offline guessing — a short or missing secret would let anyone
 * forge a session cookie (full account takeover), so we fail fast at boot rather
 * than silently signing with a weak key. In dev/test it's optional (the OAuth and
 * password flows that need it degrade with a clear message), so the app still
 * boots for local work without any secret configured.
 */
function resolveJwtSecret(): string {
  if (!isProd) return optional("JWT_SECRET");
  const secret = required("JWT_SECRET");
  if (secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }
  return secret;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port,
  corsOrigins,
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd,

  /**
   * Where the browser lives. After the Google OAuth dance the backend redirects
   * here (to a role-specific dashboard route). Defaults to the first CORS origin.
   */
  frontendUrl: optional("FRONTEND_URL", corsOrigins[0] ?? "http://localhost:3000"),

  /**
   * Public origin of this API, used to build absolute URLs for uploaded media
   * (product images). Defaults to localhost in dev. When a real object store
   * (Supabase/S3/Cloudinary) is wired in, the returned bucket URL supersedes
   * this — see products.storage.ts.
   */
  publicBaseUrl: optional("PUBLIC_BASE_URL", `http://localhost:${port}`),

  /**
   * Absolute directory the local-disk media provider writes uploads to (product
   * images, payment QRs), served at /uploads. Defaults to `./uploads` under the
   * process CWD. On an ephemeral host (e.g. Render free tier) point this at a
   * mounted persistent disk (e.g. /data/uploads) so images survive redeploys —
   * or wire a real object store and this becomes inert. See products.storage.ts.
   */
  uploadsDir: optional("UPLOADS_DIR"),

  /**
   * Direct Google OAuth (handled on the backend to keep the client secret and
   * full session control server-side — see the VendoPOS auth architecture).
   * These are read lazily; the auth router fails with a clear message if a
   * sign-in is attempted while they're unset, so the rest of the API still boots.
   */
  google: {
    clientId: optional("GOOGLE_CLIENT_ID"),
    clientSecret: optional("GOOGLE_CLIENT_SECRET"),
    redirectUri: optional(
      "GOOGLE_REDIRECT_URI",
      `http://localhost:${port}/auth/google/callback`,
    ),
  },

  /**
   * Transactional email (the Lead onboarding mail sent on provisioning).
   * Provider-agnostic and optional: with RESEND_API_KEY unset the transport just
   * logs the rendered message to the server console, so provisioning works with
   * no setup. Set the key (https://resend.com → API Keys) to deliver for real,
   * and EMAIL_FROM to a verified sender on your domain. See notifications/email.ts.
   *
   * The default `from` is a cosmetic placeholder for the pre-deploy phase. NOTE:
   * before real delivery, this MUST change — a gmail.com sender is rejected by
   * Resend (you can only send from a domain you verify). At deploy, either verify
   * a real domain in Resend (e.g. noreply@vendopos.app) or swap the transport to
   * Gmail SMTP/API. See docs/staging-validation.md §7.
   */
  email: {
    resendApiKey: optional("RESEND_API_KEY"),
    from: optional("EMAIL_FROM", "VendoPOS <vendopos@gmail.com>"),
    /**
     * Where internal/operations alerts are sent (e.g. an Enterprise concierge
     * inquiry). Optional: when unset we fall back to the `from` mailbox, and with
     * no RESEND_API_KEY the message is logged either way — so the alert seam works
     * end-to-end with zero setup, like the rest of the email layer.
     */
    adminAlertTo: optional("ADMIN_ALERT_EMAIL"),
  },

  /** Application JWT signed after Google identifies the user. Required in prod. */
  jwtSecret: resolveJwtSecret(),

  /** Secure HTTP-only session cookie carrying the application JWT. */
  session: {
    cookieName: optional("SESSION_COOKIE_NAME", "vendopos_session"),
    // Set to e.g. ".vendopos.com" when frontend and API sit on split subdomains.
    cookieDomain: optional("COOKIE_DOMAIN") || undefined,
    /**
     * Cookie SameSite policy. When the frontend and API live on DIFFERENT origins
     * (e.g. Vercel `vendopos.shop` → Render `api.vendopos.shop`), the post-login
     * credentialed `fetch` to the API is cross-origin and a `Lax` cookie is not
     * reliably sent — so the user appears logged out the instant the workspace
     * loads. `None` (which the browser requires to be paired with Secure, true in
     * prod) sends the cookie on those cross-origin calls; CSRF is still contained
     * by the strict CORS allowlist. Defaults to `none` in production and `lax`
     * locally (same-origin dev over http, where `None` without Secure is rejected).
     * Override with COOKIE_SAMESITE if the frontend and API are same-origin.
     */
    sameSite: resolveSameSite(),
    maxAgeMs: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
};

/** The validated SameSite value for auth cookies (see session.sameSite above). */
function resolveSameSite(): "lax" | "strict" | "none" {
  const raw = optional("COOKIE_SAMESITE").toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;
  return isProd ? "none" : "lax";
}
