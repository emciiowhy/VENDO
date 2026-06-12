import { query } from "../db.js";
import { asPlan, type Plan } from "../billing/plans.js";

/**
 * Super-Admin control-plane writes against the tenants table. The Super Admin
 * sits above every Tenant, so these are deliberately NOT tenant-fenced — the
 * route is SUPER_ADMIN-gated instead (see adminTenants.router.ts). Reads for the
 * directory reuse billing.repository's getSubscribers, so there is a single
 * source of truth for the tenant list.
 */

export type TenantStatus = "active" | "suspended";

export interface TenantUpdate {
  plan?: Plan;
  status?: TenantStatus;
}

export interface UpdatedTenant {
  id: string;
  name: string;
  slug: string | null;
  plan: Plan;
  status: string;
  createdAt: string;
}

/**
 * Patch a tenant's plan and/or status — the two levers an admin actually pulls
 * to support a subscriber: move their tier (which re-caps their product
 * capacity via the plan guardrail) or suspend/reinstate their workspace
 * (a suspended Tenant can no longer authenticate — see findAccountByEmail).
 * Returns null when the id matches no tenant.
 */
export async function updateTenant(
  id: string,
  patch: TenantUpdate,
): Promise<UpdatedTenant | null> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (patch.plan) {
    vals.push(patch.plan);
    sets.push(`plan = $${vals.length}`);
  }
  if (patch.status) {
    vals.push(patch.status);
    sets.push(`status = $${vals.length}`);
  }
  if (sets.length === 0) return null; // nothing to change (route validates this)

  const { rows } = await query<{
    id: string;
    name: string;
    slug: string | null;
    plan: string;
    status: string;
    created_at: Date;
  }>(
    `UPDATE tenants SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING id, name, slug, plan, status, created_at`,
    vals,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: asPlan(r.plan),
    status: r.status,
    createdAt: r.created_at.toISOString(),
  };
}
