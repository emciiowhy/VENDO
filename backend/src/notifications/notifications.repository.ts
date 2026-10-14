import { query } from "../db.js";
import { formatPeso } from "../money.js";
import type { Plan } from "../billing/plans.js";
import type { ConditionState } from "../health/health.repository.js";

/**
 * Notifications data access + the producer helpers that turn domain events into
 * per-user bell rows. Fan-out is per recipient: a store event becomes one row
 * for each owner/manager who opted in (gated by their notify_* preferences); a
 * platform event becomes one row for each SUPER_ADMIN. Every producer is
 * best-effort — it swallows its own errors and is called fire-and-forget from
 * the originating flow, so a notification hiccup can never fail a checkout, a
 * Z-Read or a lead capture.
 */

export type NotificationType =
  | "low_stock"
  | "variance"
  | "pin_request"
  | "new_lead"
  | "new_tenant"
  | "health"
  | "trial_reminder"
  | "broadcast";

export type Severity = "info" | "success" | "warning" | "danger";

export interface Notification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationSpec {
  type: NotificationType;
  severity: Severity;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey: string;
}

// ── Creation + targeting ──────────────────────────────────────────────────────

/**
 * Insert one notification per target user. The partial unique index makes a
 * repeat of the same (user, dedupeKey) a no-op while the prior one is unread, so
 * the same underlying event never stacks duplicates in the bell.
 */
async function createForUsers(
  userIds: string[],
  tenantId: string | null,
  spec: NotificationSpec,
): Promise<void> {
  if (userIds.length === 0) return;
  for (const userId of userIds) {
    await query(
      `INSERT INTO notifications (user_id, tenant_id, type, severity, title, body, link, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, dedupe_key) WHERE read_at IS NULL DO NOTHING`,
      [
        userId,
        tenantId,
        spec.type,
        spec.severity,
        spec.title,
        spec.body ?? null,
        spec.link ?? null,
        spec.dedupeKey,
      ],
    );
  }
}

interface ManagerTarget {
  id: string;
  notifyLowStock: boolean;
  notifyVariance: boolean;
}

/** Active owners/managers of a store, with their alert preferences. */
async function tenantManagers(tenantId: string): Promise<ManagerTarget[]> {
  const { rows } = await query<{
    id: string;
    notify_low_stock: boolean;
    notify_variance: boolean;
  }>(
    `SELECT id, notify_low_stock, notify_variance
       FROM users
      WHERE tenant_id = $1 AND role IN ('MERCHANT_OWNER', 'MANAGER') AND status = 'active'`,
    [tenantId],
  );
  return rows.map((r) => ({
    id: r.id,
    notifyLowStock: r.notify_low_stock,
    notifyVariance: r.notify_variance,
  }));
}

/** Active platform operators (notification recipients for platform events). */
async function superAdminIds(): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'active'`,
  );
  return rows.map((r) => r.id);
}

// ── Producers (best-effort, fire-and-forget) ──────────────────────────────────

export interface LowStockHit {
  id: string;
  name: string;
  stock: number;
  threshold: number;
}

/** A checkout dropped one or more products to/below their floor. */
export async function notifyLowStock(tenantId: string, hits: LowStockHit[]): Promise<void> {
  if (hits.length === 0) return;
  try {
    const targets = (await tenantManagers(tenantId)).filter((t) => t.notifyLowStock).map((t) => t.id);
    if (targets.length === 0) return;
    for (const h of hits) {
      const depleted = h.stock <= 0;
      await createForUsers(targets, tenantId, {
        type: "low_stock",
        severity: depleted ? "danger" : "warning",
        title: depleted ? `${h.name} is out of stock` : `${h.name} is running low`,
        body: depleted
          ? "Restock before the next sale."
          : `${h.stock} left · reorder at ${h.threshold}.`,
        link: "/dashboard/inventory",
        dedupeKey: `low_stock:${h.id}`,
      });
    }
  } catch (err) {
    console.error("[notifications] notifyLowStock failed:", err);
  }
}

export interface VarianceInfo {
  shiftId: string;
  cashierName: string;
  varianceCents: number;
}

/** A Z-Read closed with a non-zero cash variance. */
export async function notifyVariance(tenantId: string, v: VarianceInfo): Promise<void> {
  if (v.varianceCents === 0) return;
  try {
    const targets = (await tenantManagers(tenantId)).filter((t) => t.notifyVariance).map((t) => t.id);
    if (targets.length === 0) return;
    const short = v.varianceCents < 0;
    await createForUsers(targets, tenantId, {
      type: "variance",
      severity: short ? "danger" : "warning",
      title: `Cash ${short ? "shortage" : "overage"} on ${v.cashierName}'s drawer`,
      body: `${short ? "Short" : "Over"} by ${formatPeso(Math.abs(v.varianceCents))} at Z-Read.`,
      link: "/dashboard/staff",
      dedupeKey: `variance:${v.shiftId}`,
    });
  } catch (err) {
    console.error("[notifications] notifyVariance failed:", err);
  }
}

/** A cashier raised a forgot-PIN request for the owner to action. */
export async function notifyPinRequest(
  tenantId: string,
  cashierName: string,
  requestId: string,
): Promise<void> {
  try {
    const targets = (await tenantManagers(tenantId)).map((t) => t.id);
    await createForUsers(targets, tenantId, {
      type: "pin_request",
      severity: "info",
      title: `${cashierName} requested a PIN reset`,
      body: "Set a new PIN from the Cashiers console.",
      link: "/dashboard/staff",
      dedupeKey: `pin_request:${requestId}`,
    });
  } catch (err) {
    console.error("[notifications] notifyPinRequest failed:", err);
  }
}

/** A demo lead landed in the pipeline. */
export async function notifyNewLead(lead: {
  id: string;
  businessName: string;
  name: string;
}): Promise<void> {
  try {
    await createForUsers(await superAdminIds(), null, {
      type: "new_lead",
      severity: "info",
      title: `New demo request: ${lead.businessName}`,
      body: `${lead.name} wants a VendoPOS demo.`,
      link: "/admin/leads",
      dedupeKey: `new_lead:${lead.id}`,
    });
  } catch (err) {
    console.error("[notifications] notifyNewLead failed:", err);
  }
}

/** A lead was provisioned into a live tenant. */
export async function notifyNewTenant(tenant: { id: string; name: string }): Promise<void> {
  try {
    await createForUsers(await superAdminIds(), null, {
      type: "new_tenant",
      severity: "success",
      title: `New store provisioned: ${tenant.name}`,
      body: "A new merchant is now live on the platform.",
      link: "/admin/tenants",
      dedupeKey: `new_tenant:${tenant.id}`,
    });
  } catch (err) {
    console.error("[notifications] notifyNewTenant failed:", err);
  }
}

/**
 * A store's trial is approaching its end (7 / 3 / 1 days out). Sent to every
 * active owner/manager regardless of their low-stock/variance preferences —
 * this is a lifecycle alert about losing the workspace, not an opt-in operational
 * nudge (same reasoning as the PIN-reset notice). Urgency escalates with the
 * milestone, and the per-(user, dedupeKey) unique index plus the caller's
 * milestone claim keep each day's reminder to exactly one bell row.
 */
export async function notifyTrialEnding(input: {
  tenantId: string;
  day: 7 | 3 | 1;
  trialEndsAt: Date;
}): Promise<void> {
  try {
    const targets = (await tenantManagers(input.tenantId)).map((t) => t.id);
    if (targets.length === 0) return;
    const severity: Severity = input.day <= 1 ? "danger" : input.day <= 3 ? "warning" : "info";
    const dayLabel = input.day === 1 ? "tomorrow" : `in ${input.day} days`;
    await createForUsers(targets, input.tenantId, {
      type: "trial_reminder",
      severity,
      title: `Your free trial ends ${dayLabel}`,
      body: "Choose a plan to keep your store active — your data stays exactly as it is.",
      link: "/#pricing",
      dedupeKey: `trial_reminder:${input.tenantId}:${input.day}`,
    });
  } catch (err) {
    console.error("[notifications] notifyTrialEnding failed:", err);
  }
}

// ── Platform broadcast (Super Admin → every merchant) ─────────────────────────

export interface BroadcastInput {
  title: string;
  body: string | null;
  severity: Severity;
  /** Restrict to one plan tier, or null to reach every active store. */
  plan: Plan | null;
}

/**
 * The owners/managers a broadcast would reach: active store staff on a live
 * workspace (active or on trial — a suspended/expired store is deliberately not
 * messaged), optionally narrowed to one plan tier. Shared by the recipient
 * preview and the send so the count the admin confirms is the count that fans out.
 */
async function broadcastTargetIds(plan: Plan | null): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT u.id
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
      WHERE u.role IN ('MERCHANT_OWNER', 'MANAGER')
        AND u.status = 'active'
        AND t.status IN ('active', 'trial')
        AND ($1::text IS NULL OR t.plan = $1)`,
    [plan],
  );
  return rows.map((r) => r.id);
}

/** How many merchants a broadcast to this audience would reach (for the preview). */
export async function broadcastRecipientCount(plan: Plan | null): Promise<number> {
  return (await broadcastTargetIds(plan)).length;
}

/**
 * Fan a platform announcement out to every targeted merchant's bell. Unlike the
 * event producers above, this is admin-initiated and NOT fire-and-forget — the
 * caller (the SUPER_ADMIN route) awaits it and reports the delivered count, so a
 * failure surfaces instead of silently dropping. Each send carries a unique
 * dedupe key (so two distinct broadcasts never coalesce), while the per-user
 * unique index still makes a double-submit of the SAME send idempotent.
 * Returns the number of merchants messaged.
 */
export async function notifyBroadcast(input: BroadcastInput): Promise<number> {
  const targets = await broadcastTargetIds(input.plan);
  if (targets.length === 0) return 0;
  const dedupeKey = `broadcast:${Date.now()}`;
  await createForUsers(targets, null, {
    type: "broadcast",
    severity: input.severity,
    title: input.title,
    body: input.body,
    link: "/dashboard",
    dedupeKey,
  });
  return targets.length;
}

/**
 * Opportunistic platform-health check, throttled module-wide so it runs at most
 * once a minute regardless of how many admins are polling. Given there's no
 * background worker, this rides the SUPER_ADMIN notification poll: whenever an
 * operator is active anywhere in the console, we sample the DB round-trip + pool
 * occupancy — so a degraded platform surfaces in the bell even off the Health page.
 *
 * It shares the SAME transition detector the System Health Live Activity ticker
 * uses (`detectConditionEvents`), carried by module-wide state, so the bell emits
 * exactly one notification per CROSSING — a "saturated"/"latency high" line when a
 * signal goes bad, and a matching "recovered"/"back to normal" line when it clears
 * — instead of re-alerting every minute. The two surfaces always agree.
 */
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 60_000;
let healthCondState: ConditionState = { poolSaturated: false, latencyHigh: false };

// Latency flaps around its threshold, so even transition events can arrive in
// bursts; a persisted BELL notification about it is rate-limited to at most one
// per window, so the bell isn't fed repeatedly. (Pool saturation is more serious
// and far less flappy, so it is NOT throttled.) The live System Health ticker is
// unaffected — it still shows every crossing, since that's a live feed, not a bell.
const LATENCY_NOTIFY_COOLDOWN_MS = 30 * 60_000; // 30 minutes
let lastLatencyNotifyAt = 0;

export async function maybeCheckPlatformHealth(): Promise<void> {
  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) return;
  lastHealthCheck = now;
  try {
    const { sampleServerMetrics, detectConditionEvents } = await import(
      "../health/health.repository.js"
    );
    const m = await sampleServerMetrics();
    const { events, state } = detectConditionEvents(m, healthCondState);
    healthCondState = state;
    if (events.length === 0) return;
    const admins = await superAdminIds();
    if (admins.length === 0) return;
    for (const ev of events) {
      // Limiter: a latency crossing only notifies if one hasn't recently — so a
      // signal hovering near the threshold can't repeatedly feed the bell.
      if (ev.id.startsWith("health:latency:")) {
        if (now - lastLatencyNotifyAt < LATENCY_NOTIFY_COOLDOWN_MS) continue;
        lastLatencyNotifyAt = now;
      }
      await createForUsers(admins, null, {
        type: "health",
        severity: ev.severity ?? "info",
        title: ev.tenant, // the condition headline ("Connection pool saturated")
        body: ev.detail,
        link: "/admin/health",
        // ev.id is unique per transition, so each crossing is its own bell row.
        dedupeKey: ev.id,
      });
    }
  } catch (err) {
    console.error("[notifications] platform health check failed:", err);
  }
}

// ── Read API data access ──────────────────────────────────────────────────────

function toNotification(r: {
  id: string;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: Date | null;
  created_at: Date;
}): Notification {
  return {
    id: r.id,
    type: r.type as NotificationType,
    severity: r.severity as Severity,
    title: r.title,
    body: r.body,
    link: r.link,
    readAt: r.read_at ? r.read_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

/** A user's most recent notifications (read + unread), newest first. */
export async function listNotifications(userId: string, limit = 30): Promise<Notification[]> {
  const { rows } = await query<Parameters<typeof toNotification>[0]>(
    `SELECT id, type, severity, title, body, link, read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(toNotification);
}

export async function unreadCount(userId: string): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

/** Mark one of the user's notifications read. Returns false if it isn't theirs. */
export async function markRead(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE notifications SET read_at = now()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Mark every unread notification for the user read. Returns how many changed. */
export async function markAllRead(userId: string): Promise<number> {
  const { rowCount } = await query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return rowCount ?? 0;
}
