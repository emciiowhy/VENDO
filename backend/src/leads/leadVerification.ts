import { randomBytes, createHash } from "node:crypto";

/**
 * Email-verification token primitives for demo-request Leads.
 *
 * The token is a 256-bit URL-safe random string handed to the prospect in their
 * verification link. We persist ONLY its SHA-256 hash (like a password-reset
 * token): the raw value lives only in the email, so a leak of the `leads` table
 * can't be replayed to verify an address. SHA-256 (unsalted) is the right tool
 * here — the token is already high-entropy, so there's nothing to brute-force,
 * and a plain hash keeps the lookup a single indexed equality.
 */

/** How long a verification link stays valid. */
export const VERIFY_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export interface VerifyToken {
  /** The raw token to embed in the email link (never stored). */
  raw: string;
  /** The SHA-256 hex hash to persist and look up by. */
  hash: string;
  /** Absolute expiry, VERIFY_TTL_MS from now. */
  expiresAt: Date;
}

/** Hash a raw verification token for storage / lookup. */
export function hashVerifyToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a fresh verification token (raw + hash + expiry). */
export function createVerifyToken(now: Date = new Date()): VerifyToken {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    hash: hashVerifyToken(raw),
    expiresAt: new Date(now.getTime() + VERIFY_TTL_MS),
  };
}
