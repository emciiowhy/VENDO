import { pool, query } from "../db.js";
import { notifyNewTenant } from "../notifications/notifications.repository.js";
import type { AdminLead, LeadStatus, ProvisionInput } from "./adminLeads.schema.js";

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
  };
}

const SELECT = `id, business_name, name, email, phone, status,
  created_at AS requested_at, business_type, message`;

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
  | { ok: true; tenant: { id: string; name: string; slug: string; plan: string }; lead: AdminLead }
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

    // 2. Insert the new store.
    const tenantRes = await client.query<{ id: string; name: string; slug: string; plan: string }>(
      `INSERT INTO tenants (name, slug, plan, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, name, slug, plan`,
      [input.storeName, input.slug, input.plan],
    );
    const tenant = tenantRes.rows[0];

    // 3. Insert the owner, linking their (verified Google) email.
    await client.query(
      `INSERT INTO users (tenant_id, email, name, role, status)
       VALUES ($1, $2, $3, 'MERCHANT_OWNER', 'active')`,
      [tenant.id, input.ownerEmail, input.ownerName],
    );

    // 4. Mark the lead approved.
    await client.query(`UPDATE leads SET status = 'APPROVED' WHERE id = $1`, [leadId]);

    await client.query("COMMIT");
    // Announce the new store to platform operators (best-effort).
    void notifyNewTenant({ id: tenant.id, name: tenant.name });
    return {
      ok: true,
      tenant,
      lead: toAdminLead({ ...leadRow, status: "APPROVED" }),
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
