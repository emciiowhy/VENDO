import { query } from "../db.js";

/**
 * Data access for the Super-Admin support/operate surface — the actions an
 * operator takes ON a subscriber from the Tenants console: recover the owner's
 * credentials (A1), read/append a support narrative (A2), and force-close a
 * stuck cashier shift (A3).
 *
 * Like the rest of the admin control plane these are deliberately NOT
 * tenant-fenced — the platform operator sits above every Tenant and the routes
 * are SUPER_ADMIN-gated (see adminSupport.router.ts).
 */

/** The owner + store context the credential-recovery actions (A1) need. */
export interface TenantOwnerSupport {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  /** Whether a password is already set — selects the onboarding email's sign-in step. */
  hasPassword: boolean;
  tenantName: string;
  slug: string | null;
  plan: string;
}

/**
 * The oldest active MERCHANT_OWNER for a Tenant plus the store context the
 * support emails need. Unlike `findTenantOwnerSession` (impersonation) this does
 * NOT exclude suspended tenants — an operator may well need to recover an owner's
 * password precisely while the workspace is suspended. Returns null when the
 * store has no active owner to act on.
 */
export async function getTenantOwnerForSupport(
  tenantId: string,
): Promise<TenantOwnerSupport | null> {
  const { rows } = await query<{
    owner_id: string;
    owner_name: string;
    owner_email: string;
    password_hash: string | null;
    tenant_name: string;
    slug: string | null;
    plan: string;
  }>(
    `SELECT u.id   AS owner_id,
            u.name AS owner_name,
            u.email AS owner_email,
            u.password_hash,
            t.name AS tenant_name,
            t.slug,
            t.plan
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.tenant_id = $1
        AND u.role = 'MERCHANT_OWNER'
        AND u.status = 'active'
      ORDER BY u.created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    hasPassword: r.password_hash !== null,
    tenantName: r.tenant_name,
    slug: r.slug,
    plan: r.plan,
  };
}

/** A store's display name (for audit snapshots / toasts). Null when unknown. */
export async function tenantNameForSupport(tenantId: string): Promise<string | null> {
  const { rows } = await query<{ name: string }>(
    `SELECT name FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return rows[0]?.name ?? null;
}

/** One open cashier shift awaiting close, for the A3 force-close picker. */
export interface OpenShiftRow {
  /** The cashier's user id — the key forceCloseShiftForCashier reconciles on. */
  cashierUserId: string;
  cashierName: string;
  openingCents: number;
  openedAt: string;
  /** Running gross sales rung up in this shift so far (cash + ewallet + card). */
  salesCents: number;
}

/**
 * Every currently-open shift in a Tenant, newest first, with the live running
 * sales total so the operator can see what they're about to Z-Read. Mirrors the
 * tally the force-close itself recomputes. A shift with a null cashier_user_id
 * (owner left the users table) can't be force-closed by the cashier-keyed
 * reconciler, so it is excluded.
 */
export async function listOpenShifts(tenantId: string): Promise<OpenShiftRow[]> {
  const { rows } = await query<{
    cashier_user_id: string;
    cashier_name: string;
    opening_cents: number;
    opened_at: Date;
    sales_cents: string | null;
  }>(
    `SELECT s.cashier_user_id,
            s.cashier_name,
            s.opening_cents,
            s.opened_at,
            COALESCE(SUM(sa.total_cents), 0) AS sales_cents
       FROM cashier_shifts s
       LEFT JOIN sales sa ON sa.shift_id = s.id
      WHERE s.tenant_id = $1
        AND s.status = 'open'
        AND s.cashier_user_id IS NOT NULL
      GROUP BY s.id, s.cashier_user_id, s.cashier_name, s.opening_cents, s.opened_at
      ORDER BY s.opened_at DESC`,
    [tenantId],
  );
  return rows.map((r) => ({
    cashierUserId: r.cashier_user_id,
    cashierName: r.cashier_name,
    openingCents: r.opening_cents,
    openedAt: r.opened_at.toISOString(),
    salesCents: Number(r.sales_cents ?? 0),
  }));
}

/* ------------------------------ A2: support notes --------------------------- */

export interface SupportNote {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Append a support note to a Tenant. Returns the created row. */
export async function createSupportNote(
  tenantId: string,
  authorUserId: string,
  authorName: string,
  body: string,
): Promise<SupportNote> {
  const { rows } = await query<{
    id: string;
    author_name: string;
    body: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `INSERT INTO tenant_support_notes (tenant_id, author_user_id, author_name, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, author_name, body, created_at, updated_at`,
    [tenantId, authorUserId, authorName, body],
  );
  return toNote(rows[0]);
}

/** Edit a note's body (scoped to its tenant). Returns null when no such note. */
export async function updateSupportNote(
  tenantId: string,
  noteId: string,
  body: string,
): Promise<SupportNote | null> {
  const { rows } = await query<{
    id: string;
    author_name: string;
    body: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `UPDATE tenant_support_notes
        SET body = $3, updated_at = now()
      WHERE id = $2 AND tenant_id = $1
      RETURNING id, author_name, body, created_at, updated_at`,
    [tenantId, noteId, body],
  );
  return rows[0] ? toNote(rows[0]) : null;
}

/** Delete a note (scoped to its tenant). Returns true when a row was removed. */
export async function deleteSupportNote(tenantId: string, noteId: string): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM tenant_support_notes WHERE id = $1 AND tenant_id = $2`,
    [noteId, tenantId],
  );
  return (rowCount ?? 0) > 0;
}

function toNote(r: {
  id: string;
  author_name: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}): SupportNote {
  return {
    id: r.id,
    authorName: r.author_name,
    body: r.body,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/**
 * One row in the per-tenant support timeline — either a manual note (editable)
 * or an immutable audit event. The UI renders them in one chronological stream;
 * `kind` selects the affordances (edit/delete only on notes).
 */
export type TimelineEntry =
  | {
      kind: "note";
      id: string;
      authorName: string;
      body: string;
      at: string;
      /** True once edited (updated_at drifted past created_at). */
      edited: boolean;
    }
  | {
      kind: "event";
      id: string;
      authorName: string;
      action: string;
      detail: string | null;
      at: string;
    };

/**
 * The tenant's full support story: manual notes UNION'd with the audit events
 * that target this tenant, newest first. Two cheap indexed reads merged in app
 * code (rather than a SQL UNION across differently-shaped tables) so each side
 * stays independently typed.
 */
export async function listTenantTimeline(tenantId: string): Promise<TimelineEntry[]> {
  const [noteRes, auditRes] = await Promise.all([
    query<{
      id: string;
      author_name: string;
      body: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, author_name, body, created_at, updated_at
         FROM tenant_support_notes
        WHERE tenant_id = $1
        ORDER BY created_at DESC`,
      [tenantId],
    ),
    query<{
      id: string;
      actor_name: string;
      action: string;
      detail: string | null;
      created_at: Date;
    }>(
      `SELECT id, actor_name, action, detail, created_at
         FROM admin_audit_logs
        WHERE target_tenant_id = $1
        ORDER BY created_at DESC`,
      [tenantId],
    ),
  ]);

  const notes: TimelineEntry[] = noteRes.rows.map((r) => ({
    kind: "note",
    id: r.id,
    authorName: r.author_name,
    body: r.body,
    at: r.created_at.toISOString(),
    edited: r.updated_at.getTime() - r.created_at.getTime() > 1000,
  }));
  const events: TimelineEntry[] = auditRes.rows.map((r) => ({
    kind: "event",
    id: r.id,
    authorName: r.actor_name,
    action: r.action,
    detail: r.detail,
    at: r.created_at.toISOString(),
  }));

  return [...notes, ...events].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
