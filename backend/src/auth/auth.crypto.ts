import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { env } from "../env.js";

/**
 * Small security primitives for the auth module — kept dependency-free on
 * Node's built-in crypto.
 *
 *  • Cashier PINs are short (4 digits) and shared-terminal-local, so we still
 *    hash them with scrypt + a per-PIN salt; never store the raw PIN.
 *  • The OAuth `state` parameter is an HMAC-signed random nonce used for CSRF
 *    protection across the Google handshake (stored in a short-lived cookie,
 *    echoed back by Google, compared on the callback).
 */

const SCRYPT_KEYLEN = 32;

/** Hash a 4-digit cashier PIN as `scrypt$<saltHex>$<hashHex>`. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time verify of a PIN against a stored `scrypt$salt$hash` string. */
export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const PW_KEYLEN = 64;

/**
 * Hash an OWNER/MANAGER password as `pw1$<saltHex>$<hashHex>` (scrypt + per-user
 * salt). Same primitive as the cashier PIN but a longer key, and tagged with its
 * own version prefix so the two hash spaces can never be confused. Never store
 * the raw password.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, PW_KEYLEN);
  return `pw1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time verify of a password against a stored `pw1$salt$hash` string. */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "pw1") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Random URL-safe nonce for the OAuth state parameter. */
export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Sign a value with the JWT secret so a cookie can't be forged. Used to bind
 * the OAuth `state` nonce to a tamper-evident cookie value.
 */
export function sign(value: string): string {
  const sig = createHmac("sha256", env.jwtSecret || "dev-unsigned")
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

/** Verify a `value.signature` pair; returns the value if intact, else null. */
export function unsign(signed: string | undefined | null): string | null {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  const a = Buffer.from(signed);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}
