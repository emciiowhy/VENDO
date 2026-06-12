import { query } from "../db.js";
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
  };
}

/** Persist a validated Lead to NeonDB and return the stored record. */
export async function insertLead(input: LeadInput): Promise<Lead> {
  const message = input.message && input.message.length > 0 ? input.message : null;
  // Email is the pipeline key (unique). A re-submission refreshes the contact
  // details and resurfaces the lead rather than erroring on the constraint;
  // the provisioning status is intentionally left untouched.
  const { rows } = await query<LeadRow>(
    `INSERT INTO leads (name, business_name, email, phone, business_type, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (lower(email)) DO UPDATE SET
       name = EXCLUDED.name,
       business_name = EXCLUDED.business_name,
       phone = EXCLUDED.phone,
       business_type = EXCLUDED.business_type,
       message = EXCLUDED.message,
       created_at = now()
     RETURNING id, name, business_name, email, phone, business_type, message, created_at`,
    [input.name, input.businessName, input.email, input.phone, input.businessType, message],
  );
  const lead = toLead(rows[0]);
  // Surface the new demo request in the Super Admin bell (best-effort).
  void notifyNewLead({ id: lead.id, businessName: lead.businessName, name: lead.name });
  return lead;
}

/** Most-recent Leads first — a thin read for a future Super Admin pipeline view. */
export async function listLeads(limit = 50): Promise<Lead[]> {
  const { rows } = await query<LeadRow>(
    `SELECT id, name, business_name, email, phone, business_type, message, created_at
     FROM leads
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map(toLead);
}
