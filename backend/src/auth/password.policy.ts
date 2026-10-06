/**
 * Owner / manager account password policy — the single source of truth for what
 * counts as an acceptable password. Cashier PINs are a separate space (4 digits,
 * see auth.crypto.ts) and are NOT governed by this.
 *
 * Design (NIST SP 800-63B aligned, with a couple of pragmatic guards):
 *   • Length first — the strongest single lever. Min 10, generous max (the cap
 *     also fences off a scrypt CPU/-memory DoS from a megabyte "password").
 *   • Allow spaces *inside* the secret (passphrases are good) — but a password
 *     that is blank or ONLY whitespace, or padded with leading/trailing spaces
 *     to fake length, is rejected. (This is the "it accepted all spaces" bug.)
 *   • A little variety (≥2 character classes) and a repeated-/single-char guard
 *     so "aaaaaaaaaa" / "1234567890" can't pass.
 *   • Screen against a denylist of the most-guessed passwords.
 *
 * `validatePassword` returns a user-facing error string, or null when the
 * password is acceptable. Used by every path that SETS a password (self-service
 * signup, owner/manager password change, and the optional lead owner password).
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * The most-abused passwords, normalised (lowercased, spaces stripped). Not a
 * full breach corpus — a cheap, offline screen for the obvious ones. Compared
 * against the password's normalised form so "P A S S W O R D" can't sneak by.
 */
const COMMON_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "passw0rd123",
  "1234567890",
  "12345678",
  "123456789",
  "123123123",
  "qwertyuiop",
  "qwerty123",
  "1q2w3e4r5t",
  "iloveyou",
  "welcome1",
  "welcome123",
  "admin1234",
  "administrator",
  "letmein123",
  "changeme123",
  "abcdefghij",
  "abcd123456",
  "vendopos",
  "vendopos123",
]);

/**
 * Validate a plaintext password. Returns a human-readable reason it was rejected,
 * or null if it passes. The same function guards the API and (mirrored) the UI,
 * so client and server never disagree on what's acceptable.
 */
export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a password.";
  }
  // Leading/trailing whitespace doesn't count toward strength — this is what
  // defeats an all-spaces or space-padded password. Internal spaces are kept.
  const core = password.trim();
  if (core.length === 0) {
    return "Your password can't be blank or only spaces.";
  }
  if (core.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters (spaces at the start or end don't count).`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  // Variety: at least two of {lowercase, uppercase, digit, symbol}. This also
  // rejects a single-class password like "1234567890" or "abcdefghij".
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (classes < 2) {
    return "Use a mix of at least two of: lowercase letters, uppercase letters, numbers, or symbols.";
  }
  // A single character repeated ("aaaaaaaaaa") carries no entropy.
  if (/^(.)\1+$/.test(core)) {
    return "Choose a less predictable password.";
  }
  // Screen against the most-guessed passwords (normalised).
  const normalised = core.toLowerCase().replace(/\s+/g, "");
  if (COMMON_PASSWORDS.has(normalised)) {
    return "That password is too common — choose something harder to guess.";
  }
  return null;
}
