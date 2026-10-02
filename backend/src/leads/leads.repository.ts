import { query } from "../db.js";
import { hashPassword } from "../auth/auth.crypto.js";
import { notifyNewLead } from "../notifications/notifications.repository.js";
import type { Lead, LeadInput } from "./leads.schema.js";

interface LeadRow {
  id: string;
  name: string;
  business_name: string;
  email: string;
  phone: string;
  business_type: string;
  message: string | null;
  created_at: Date;
  email_verified_at: Date | null;
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    businessName: row.business_name,
    email: row.email,
    phone: row.phone,
    businessType: row.business_type as Lead["businessType"],
    message: row.message ?? undefined,
    createdAt: row.created_at.toISOString(),
    emailVerified: row.email_verified_at !== null,
  };
}

/** Persist a validated Lead to NeonDB and return the stored record. */
export async function insertLead(input: LeadInput): Promise<Lead> {
  const message = input.message && input.message.length > 0 ? input.message : null;
  // Hash the optional owner password at the seam (never store the raw value).
  // Empty/absent → null, so the lead provisions a Google-only owner as before.
  const ownerPasswordHash =
    input.password && input.password.length >= 8 ? hashPassword(input.password) : null;
  // Email is the pipeline key (unique). A re-submission refreshes the contact
  // details and resurfaces the lead rather than erroring on the constraint;
  // the provisioning status is intentionally left untouched. The owner password
  // hash is preserved on a re-submission that omits it (COALESCE), and replaced
  // when a new one is supplied — so a prospect can come back and set/change it.
  const { rows } = await query<LeadRow>(
    `INSERT INTO leads (name, business_name, email, phone, business_type, message, owner_password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (lower(email)) DO UPDATE SET
       name = EXCLUDED.name,
       business_name = EXCLUDED.business_name,
       phone = EXCLUDED.phone,
       business_type = EXCLUDED.business_type,
       message = EXCLUDED.message,
       owner_password_hash = COALESCE(EXCLUDED.owner_password_hash, leads.owner_password_hash),
       created_at = now()
     RETURNING id, name, business_name, email, phone, business_type, message, created_at, email_verified_at`,
    [input.name, input.businessName, input.email, input.phone, input.businessType, message, ownerPasswordHash],
  );
  const lead = toLead(rows[0]);
  // Surface the new demo request in the Super Admin bell (best-effort).
  void notifyNewLead({ id: lead.id, businessName: lead.businessName, name: lead.name });
  return lead;
}

/** Most-recent Leads first — a thin read for a future Super Admin pipeline view. */
export async function listLeads(limit = 50): Promise<Lead[]> {
  const { rows } = await query<LeadRow>(
    `SELECT id, name, business_name, email, phone, business_type, message, created_at, email_verified_at
     FROM leads
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map(toLead);
}

/** Store a freshly-minted verification token (hash + expiry) on a lead. */
export async function setLeadVerifyToken(
  leadId: string,
  hash: string,
  expiresAt: Date,
): Promise<void> {
  await query(
    `UPDATE leads SET verify_token_hash = $2, verify_token_expires_at = $3 WHERE id = $1`,
    [leadId, hash, expiresAt.toISOString()],
  );
}

export interface VerifyOutcome {
  ok: boolean;
  email?: string;
}

/**
 * Consume a verification token: stamp `email_verified_at` and clear the token
 * (single-use) when the hash matches an unexpired, not-yet-verified lead. Returns
 * `{ ok: false }` for an unknown, expired, or already-consumed token — the route
 * maps both to one neutral message so the endpoint never reveals which leads exist.
 */
export async function verifyLeadEmailByToken(hash: string): Promise<VerifyOutcome> {
  const { rows } = await query<{ email: string }>(
    `UPDATE leads
        SET email_verified_at = now(),
            verify_token_hash = NULL,
            verify_token_expires_at = NULL
      WHERE verify_token_hash = $1
        AND verify_token_expires_at > now()
        AND email_verified_at IS NULL
      RETURNING email`,
    [hash],
  );
  return rows[0] ? { ok: true, email: rows[0].email } : { ok: false };
}
