/**
 * Client mirror of the backend owner/manager password policy
 * (backend/src/auth/password.policy.ts). Kept byte-for-byte equivalent so the
 * form's instant feedback never disagrees with the server's verdict. The server
 * is still the authority — this is purely UX. Keep the two in sync if either
 * changes.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

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

/** Returns a user-facing reason the password is rejected, or null if it passes. */
export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a password.";
  }
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
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  if (classes < 2) {
    return "Use a mix of at least two of: lowercase letters, uppercase letters, numbers, or symbols.";
  }
  if (/^(.)\1+$/.test(core)) {
    return "Choose a less predictable password.";
  }
  const normalised = core.toLowerCase().replace(/\s+/g, "");
  if (COMMON_PASSWORDS.has(normalised)) {
    return "That password is too common — choose something harder to guess.";
  }
  return null;
}
