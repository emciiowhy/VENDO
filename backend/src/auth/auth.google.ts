import { env } from "../env.js";

/**
 * Direct Google OAuth 2.0, spoken straight from the Express backend — no
 * frontend SDK. We build the consent URL, exchange the authorization code for
 * tokens, and read the user's identity ourselves so the client secret and the
 * resulting session never leave the server.
 *
 * Endpoints (Google OpenID Connect):
 *   authorize  https://accounts.google.com/o/oauth2/v2/auth
 *   token      https://oauth2.googleapis.com/token
 *   userinfo   https://openidconnect.googleapis.com/v1/userinfo
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string;
}

/** True only when the backend has everything it needs to talk to Google. */
export function googleConfigured(): boolean {
  return Boolean(env.google.clientId && env.google.clientSecret && env.jwtSecret);
}

/** Build the Google consent URL, carrying our CSRF `state` nonce. */
export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: env.google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Exchange the authorization code for an access token. */
async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Google token exchange returned no access_token.");
  return data.access_token;
}

/** Read the authenticated user's profile from Google. */
async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status}): ${await res.text()}`);
  }
  const u = (await res.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: u.sub,
    email: u.email.toLowerCase(),
    emailVerified: Boolean(u.email_verified),
    name: u.name ?? u.email,
    picture: u.picture,
  };
}

/** Full callback handshake: code → access token → Google profile. */
export async function profileFromCode(code: string): Promise<GoogleProfile> {
  const accessToken = await exchangeCode(code);
  return fetchProfile(accessToken);
}
