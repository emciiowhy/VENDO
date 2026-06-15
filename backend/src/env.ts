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

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port,
  corsOrigins,
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: (process.env.NODE_ENV ?? "development") === "production",

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
   */
  email: {
    resendApiKey: optional("RESEND_API_KEY"),
    from: optional("EMAIL_FROM", "VendoPOS <onboarding@vendopos.app>"),
  },

  /** Application JWT signed after Google identifies the user. */
  jwtSecret: optional("JWT_SECRET"),

  /** Secure HTTP-only session cookie carrying the application JWT. */
  session: {
    cookieName: optional("SESSION_COOKIE_NAME", "vendopos_session"),
    // Set to e.g. ".vendopos.com" when frontend and API sit on split subdomains.
    cookieDomain: optional("COOKIE_DOMAIN") || undefined,
    maxAgeMs: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
};
