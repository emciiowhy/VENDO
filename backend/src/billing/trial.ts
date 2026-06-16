import { query } from "../db.js";
import { sendTrialExpiredEmail } from "../notifications/trialExpiredEmail.js";

/**
 * Trial lifecycle — the self-service expiration engine.
 *
 * A trial store rests at `status = 'trial'` until a request lands AFTER its
 * `trial_ends_at`. At that moment we LAZILY flip it to `trial_expired`, in a
 * single atomic UPDATE so exactly one concurrent request wins the transition —
 * which is also the one (and only) seam that fires the recovery email. There is
 * deliberately no cron: the lapse is evaluated on access, so the status is always
 * truthful the first time anyone touches the store after the window closes, and
 * a store nobody visits costs nothing.
 *
 * `evaluateTenantStatus` is the read used by both the API checkpoint
 * (trial.middleware.ts → 402 on a lapsed store) and /auth/me (so the workspace
 * swaps to the recovery view on its next heartbeat). The lifecycle is resolved
 * LIVE from the row, never the JWT, so an upgrade or a lapse bites on the very
 * next request.
 */

export type TenantLifecycle = "trial" | "active" | "trial_expired" | "suspended";

export interface TenantStatusResult {
  status: TenantLifecycle;
  /** ISO timestamp the trial window ends/ended, or null for a non-trial store. */
  trialEndsAt: string | null;
}

interface TrialSnapshotRow {
  status: TenantLifecycle;
  trial_ends_at: Date | null;
  store_name: string;
  plan: string;
  owner_name: string | null;
  owner_email: string | null;
}

/**
 * The tenant's lifecycle plus everything the recovery email needs (store name,
 * plan, and the oldest active owner's name/email), in one round-trip. The owner
 * join is LEFT so a store with no owner yet still resolves (just without a
 * recovery recipient). Null when the tenant id is unknown.
 */
async function loadTrialSnapshot(tenantId: string): Promise<TrialSnapshotRow | null> {
  const { rows } = await query<TrialSnapshotRow>(
    `SELECT t.status,
            t.trial_ends_at,
            t.name        AS store_name,
            t.plan        AS plan,
            u.name        AS owner_name,
            u.email       AS owner_email
       FROM tenants t
       LEFT JOIN users u
         ON u.tenant_id = t.id
        AND u.role = 'MERCHANT_OWNER'
        AND u.status = 'active'
      WHERE t.id = $1
      ORDER BY u.created_at ASC
      LIMIT 1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

/**
 * Atomically flip a lapsed trial to `trial_expired`. The WHERE clause is the lock:
 * only a row still in `trial` whose window has passed is updated, and only the
 * first caller to reach it gets a returned row — so concurrent requests can't
 * double-fire the recovery email. Returns true iff THIS call performed the flip.
 */
async function expireTrial(tenantId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE tenants
        SET status = 'trial_expired'
      WHERE id = $1
        AND status = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at <= now()`,
    [tenantId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Resolve a tenant's effective lifecycle status, applying the lazy trial lapse
 * along the way. When a `trial` store's window has passed this transitions it to
 * `trial_expired` and fires the recovery email exactly once (best-effort, never
 * awaited into the caller's critical path). Returns null for an unknown tenant.
 */
export async function evaluateTenantStatus(
  tenantId: string,
): Promise<TenantStatusResult | null> {
  const snap = await loadTrialSnapshot(tenantId);
  if (!snap) return null;

  const trialEndsAt = snap.trial_ends_at ? snap.trial_ends_at.toISOString() : null;

  const lapsed =
    snap.status === "trial" &&
    snap.trial_ends_at !== null &&
    snap.trial_ends_at.getTime() <= Date.now();

  if (lapsed) {
    const won = await expireTrial(tenantId);
    // Only the request that actually performed the flip emails the owner, so the
    // recovery prompt goes out once rather than on every post-lapse request.
    if (won && snap.owner_email) {
      void sendTrialExpiredEmail({
        ownerName: snap.owner_name ?? "there",
        ownerEmail: snap.owner_email,
        storeName: snap.store_name,
        plan: snap.plan,
        trialEndedAt: trialEndsAt,
      });
    }
    return { status: "trial_expired", trialEndsAt };
  }

  return { status: snap.status, trialEndsAt };
}
