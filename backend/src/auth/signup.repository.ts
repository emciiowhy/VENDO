import { pool } from "../db.js";
import { hashPassword } from "./auth.crypto.js";
import { seedDemoWorkspace } from "./demoSeed.js";
import { tierFromPlan } from "../lib/tiers.js";
import type { Session } from "./auth.types.js";

/**
 * Self-service merchant signup. Unlike the operator-driven lead → tenant
 * promotion (admin/adminLeads.repository.ts), this lets a prospect create their
 * own isolated store from the pricing page and walk straight in on a 14-day
 * trial.
 *
 * The whole thing is one transaction — collision checks → INSERT tenant →
 * INSERT MERCHANT_OWNER → seed a demo workspace → COMMIT — so a failure anywhere
 * (a taken email, a seed error) rolls back cleanly and never leaves a
 * half-provisioned tenant. Multi-tenant isolation is preserved: every seeded row
 * is fenced to the brand-new tenant id.
 */

export type SignupPlan = "starter" | "business";

export interface SignupInput {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  plan: SignupPlan;
}

export interface SignupTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export type SignupResult =
  | { ok: true; session: Session; tenant: SignupTenant; trialEndsAt: string }
  | { ok: false; error: "EMAIL_TAKEN" };

const SLUG_MAX = 48;

/** Lower-case, URL-safe slug from a business name; falls back to "store". */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, SLUG_MAX) || "store"
  );
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

export async function signUpMerchant(input: SignupInput): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Email is the global sign-in identity — it must be free.
    const emailHit = await client.query(
      `SELECT 1 FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    if (emailHit.rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "EMAIL_TAKEN" };
    }

    // Resolve a free Store ID from the business name (random suffix on collision).
    const base = slugify(input.businessName);
    let slug = base;
    for (let attempt = 0; attempt < 6; attempt++) {
      const hit = await client.query(`SELECT 1 FROM tenants WHERE lower(slug) = lower($1) LIMIT 1`, [
        slug,
      ]);
      if (!hit.rowCount) break;
      slug = `${base}-${randomSuffix()}`;
    }

    // A fresh, isolated tenant on the chosen plan, opened on a 14-day trial:
    // status 'trial' with the window stamped from now. `tier` is the plan's
    // feature-gating projection, set in the same insert so the two are consistent
    // from the very first row (Starter signups land on STARTER, Business on
    // BUSINESS). The trial lapses to 'trial_expired' lazily once trial_ends_at
    // passes (see billing/trial.ts) — never here, where it's brand new.
    const tenantRes = await client.query<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      trial_ends_at: Date;
    }>(
      `INSERT INTO tenants (name, slug, plan, tier, status, trial_starts_at, trial_ends_at)
       VALUES ($1, $2, $3, $4, 'trial', now(), now() + interval '14 days')
       RETURNING id, name, slug, plan, trial_ends_at`,
      [input.businessName, slug, input.plan, tierFromPlan(input.plan)],
    );
    const tenant = tenantRes.rows[0];

    // The owner account, signing in with the password they just chose. (They can
    // still attach Google later — first OAuth stamps google_sub onto this row.)
    const ownerRes = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
       VALUES ($1, $2, $3, 'MERCHANT_OWNER', 'active', $4)
       RETURNING id`,
      [tenant.id, email, input.ownerName, hashPassword(input.password)],
    );
    const ownerId = ownerRes.rows[0].id;

    // Right after tenant isolation is established: seed the sandbox workspace.
    await seedDemoWorkspace(client, tenant.id);

    await client.query("COMMIT");

    return {
      ok: true,
      session: {
        userId: ownerId,
        tenantId: tenant.id,
        role: "MERCHANT_OWNER",
        email,
        name: input.ownerName,
      },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
      trialEndsAt: tenant.trial_ends_at.toISOString(),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // A race that beat our pre-check to the email is still a "taken" outcome.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION) {
      return { ok: false, error: "EMAIL_TAKEN" };
    }
    throw err;
  } finally {
    client.release();
  }
}
