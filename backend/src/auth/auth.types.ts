/**
 * Authorization in VendoPOS is decided by database rows, not by Google.
 * Google Identity only answers "who is this human?"; the `role` and `tenantId`
 * that gate every request come from our own `users`/`tenants` tables and are
 * baked into the signed application JWT so the data layer can enforce row
 * isolation without a lookup on every request.
 */
export type Role = "SUPER_ADMIN" | "MERCHANT_OWNER" | "MANAGER" | "CASHIER";

export const ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "MERCHANT_OWNER",
  "MANAGER",
  "CASHIER",
] as const;

/**
 * The application session — what we sign into the JWT and hang off `req.user`.
 * `tenantId` is null only for the SUPER_ADMIN, who sits above all Tenants.
 */
export interface Session {
  userId: string;
  tenantId: string | null;
  role: Role;
  email: string;
  name: string;
  /**
   * The `sessions` row id this token was minted for, baked into the JWT so the
   * stateless cookie maps back to a revocable device record. Optional because
   * legacy tokens (issued before session tracking) carry none — those are
   * honoured until they expire, but can't be listed or revoked individually.
   */
  sid?: string;
}

/**
 * The post-login destination on the frontend, resolved from the role.
 * SUPER_ADMIN lands on the platform-wide command center; everyone inside a
 * Tenant lands on their store dashboard (the POS terminal locks itself down
 * separately once a cashier PIN-switches in).
 */
export function dashboardPathForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "CASHIER":
      return "/pos";
    case "MERCHANT_OWNER":
    case "MANAGER":
    default:
      return "/dashboard";
  }
}
