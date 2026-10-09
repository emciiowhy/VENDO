import { pool, query } from "../db.js";
import { hashPassword } from "../auth/auth.crypto.js";
import { notifyNewTenant } from "../notifications/notifications.repository.js";
import { sendOwnerOnboardingEmail } from "../notifications/onboardingEmail.js";
import { tierFromPlan } from "../lib/tiers.js";
import type { AdminLead, LeadEditInput, LeadStatus, ProvisionInput } from "./adminLeads.schema.js";

/**
 * Data access for the Super Admin Leads pipeline, including the atomic
 * lead → tenant promotion.
 */

interface LeadRow {
  id: string;
  business_name: string;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  requested_at: Date;
  business_type: string | null;
  message: string | null;
  owner_password_hash: string | null;
  email_verified_at: Date | null;
}

function toAdminLead(row: LeadRow): AdminLead {
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    businessType: row.business_type,
    message: row.message,
    // Expose only whether a password exists — never the hash itself.
    hasOwnerPassword: row.owner_password_hash !== null,
    // Whether the prospect confirmed ownership of their email address.
    emailVerified: row.email_verified_at !== null,
  };
}

const SELECT = `id, business_name, name, email, phone, status,
  created_at AS requested_at, business_type, message, owner_password_hash, email_verified_at`;

/** Whole pipeline, most-recent first (pending naturally bubble up as newest). */
export async function listLeads(): Promise<AdminLead[]> {
  const { rows } = await query<LeadRow>(
    `SELECT ${SELECT} FROM leads ORDER BY created_at DESC`,
  );
  return rows.map(toAdminLead);
}

/** Typed failures the router maps to clean, non-crashing responses. */
export type ProvisionError =
  | { code: "NOT_FOUND" }
  | { code: "ALREADY_HANDLED"; status: LeadStatus }
  | { code: "SLUG_TAKEN" }
  | { code: "EMAIL_TAKEN" };

export type ProvisionResult =
  | {
      ok: true;
      tenant: { id: string; name: string; slug: string; plan: string };
      lead: AdminLead;
      /**
       * Whether the onboarding email actually reached the transport. False on a
       * Resend rejection (e.g. unverified sender domain) or a key-less log
       * transport — the store is still fully provisioned either way; this just
       * lets the admin UI flag that the welcome mail didn't go out.
       */
      mailDelivered: boolean;
    }
  | { ok: false; error: ProvisionError };

/**
 * Promote a lead into a live, isolated tenant inside a single transaction:
 * BEGIN → collision checks → INSERT tenant → INSERT MERCHANT_OWNER user →
 * mark lead APPROVED → COMMIT. Any failure rolls the whole thing back, so a
 * slug/email collision never leaves a half-provisioned store behind.
 */
export async function provisionLead(
  leadId: string,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the lead row for the duration so two approvals can't race.
    const leadRes = await client.query<LeadRow>(
      `SELECT ${SELECT} FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId],
    );
    const leadRow = leadRes.rows[0];
    if (!leadRow) {
      await client.query("ROLLBACK");
      return { ok: false, error: { code: "NOT_FOUND" } };
    }
    if (leadRow.status !== "PENDING_DEMO") {
      await client.query("ROLLBACK");
      return { ok: false, error: { code: "ALREADY_HANDLED", status: leadRow.status } };
    }

    // 1. Slug collision in tenants?
    const slugHit = await client.query(
      `SELECT 1 FROM tenants WHERE lower(slug) = lower($1) LIMIT 1`,
      [input.slug],
    );
    if (slugHit.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: { code: "SLUG_TAKEN" } };
    }

    // Owner email must not already belong to a user.
    const emailHit = await client.query(
      `SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [input.ownerEmail],
    );
    if (emailHit.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: { code: "EMAIL_TAKEN" } };
    }

    // 2. Insert the new store. `tier` is set from the chosen plan in the same
    //    insert so the feature-gating level matches what the operator provisioned.
    const tenantRes = await client.query<{ id: string; name: string; slug: string; plan: string }>(
      `INSERT INTO tenants (name, slug, plan, tier, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id, name, slug, plan`,
      [input.storeName, input.slug, input.plan, tierFromPlan(input.plan)],
    );
    const tenant = tenantRes.rows[0];

    // 3. Insert the owner. The password is optional and resolved by precedence:
    //    a password the Super Admin typed here (hashed now) wins; otherwise the
    //    one the prospect set on their demo request is carried over; otherwise
    //    null — a Google-only owner, exactly as before. Either way the operator
    //    never has to invent or hand out a credential.
    const ownerPasswordHash =
      input.ownerPassword && input.ownerPassword.length >= 8
        ? hashPassword(input.ownerPassword)
        : leadRow.owner_password_hash ?? null;
    await client.query(
      `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
       VALUES ($1, $2, $3, 'MERCHANT_OWNER', 'active', $4)`,
      [tenant.id, input.ownerEmail, input.ownerName, ownerPasswordHash],
    );

    // 4. Mark the lead approved.
    await client.query(`UPDATE leads SET status = 'APPROVED' WHERE id = $1`, [leadId]);

    await client.query("COMMIT");
    // Announce the new store to platform operators (best-effort, in-app bell).
    void notifyNewTenant({ id: tenant.id, name: tenant.name });
    // Email the new owner their onboarding steps + sign-in details. `hasPassword`
    // decides whether the mail tells them to sign in with a password or Google.
    // Unlike the in-app notification above we AWAIT this — purely so the delivery
    // outcome can ride back in the response and surface in the admin UI. It's
    // safe: the store is already committed and `sendOwnerOnboardingEmail` never
    // throws, so a mail failure can't roll the store back, it just reports false.
    const mail = await sendOwnerOnboardingEmail({
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      storeName: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      hasPassword: ownerPasswordHash !== null,
    });
    return {
      ok: true,
      tenant,
      lead: toAdminLead({ ...leadRow, status: "APPROVED" }),
      mailDelivered: mail.delivered,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Decline a pending lead. Returns the updated lead, or null if not pending. */
export async function rejectLead(leadId: string): Promise<AdminLead | null> {
  const { rows } = await query<LeadRow>(
    `UPDATE leads SET status = 'REJECTED'
      WHERE id = $1 AND status = 'PENDING_DEMO'
      RETURNING ${SELECT}`,
    [leadId],
  );
  return rows[0] ? toAdminLead(rows[0]) : null;
}

/** Why an edit/delete couldn't proceed — the router maps these to clean codes. */
export type LeadMutateError =
  | { code: "NOT_FOUND" }
  | { code: "WRONG_STATUS"; status: LeadStatus };

/**
 * Correct a PENDING lead's contact/business fields. Only PENDING_DEMO leads are
 * editable — once APPROVED the owner/tenant live in their own tables and editing
 * the lead would change nothing useful. Returns the updated lead, or a typed
 * error (not found / not pending). `message` accepts "" to clear it.
 */
export async function editLead(
  leadId: string,
  input: LeadEditInput,
): Promise<{ ok: true; lead: AdminLead } | { ok: false; error: LeadMutateError }> {
  // Map API field names → columns. `contactName` is the `name` column.
  const columns: Record<string, string> = {
    businessName: "business_name",
    contactName: "name",
    email: "email",
    phone: "phone",
    businessType: "business_type",
    message: "message",
  };
  const sets: string[] = [];
  const vals: unknown[] = [leadId];
  for (const [field, column] of Object.entries(columns)) {
    const value = (input as Record<string, unknown>)[field];
    if (value !== undefined) {
      vals.push(field === "message" && value === "" ? null : value);
      sets.push(`${column} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return { ok: false, error: { code: "NOT_FOUND" } };

  // Guard the status in the UPDATE itself so an approve can't race the edit.
  const { rows } = await query<LeadRow>(
    `UPDATE leads SET ${sets.join(", ")}
      WHERE id = $1 AND status = 'PENDING_DEMO'
      RETURNING ${SELECT}`,
    vals,
  );
  if (rows[0]) return { ok: true, lead: toAdminLead(rows[0]) };

  // No row updated → either the lead is gone or it isn't PENDING. Disambiguate
  // for a precise error (404 vs 409).
  const { rows: existing } = await query<{ status: LeadStatus }>(
    `SELECT status FROM leads WHERE id = $1`,
    [leadId],
  );
  if (!existing[0]) return { ok: false, error: { code: "NOT_FOUND" } };
  return { ok: false, error: { code: "WRONG_STATUS", status: existing[0].status } };
}

/**
 * Hard-delete a lead. Allowed for PENDING_DEMO and REJECTED only — an APPROVED
 * lead is the provenance of a live tenant and is preserved. Returns the deleted
 * lead's identity for the audit snapshot, or a typed error.
 */
export async function deleteLead(
  leadId: string,
): Promise<{ ok: true; businessName: string } | { ok: false; error: LeadMutateError }> {
  const { rows } = await query<{ business_name: string }>(
    `DELETE FROM leads
      WHERE id = $1 AND status IN ('PENDING_DEMO', 'REJECTED')
      RETURNING business_name`,
    [leadId],
  );
  if (rows[0]) return { ok: true, businessName: rows[0].business_name };

  const { rows: existing } = await query<{ status: LeadStatus }>(
    `SELECT status FROM leads WHERE id = $1`,
    [leadId],
  );
  if (!existing[0]) return { ok: false, error: { code: "NOT_FOUND" } };
  return { ok: false, error: { code: "WRONG_STATUS", status: existing[0].status } };
}
