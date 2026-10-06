import { pool, query } from "../db.js";

/**
 * Live operational telemetry for the Super Admin System Health stream.
 *
 * Two real signals, no mocks:
 *   • A cross-tenant activity feed, unioned from the sales ledger and product
 *     catalogue (the two things merchants actually do that leave a timestamp).
 *   • Infrastructure vitals — the live NeonDB pool occupancy and a freshly
 *     measured round-trip query latency.
 *
 * These are platform-wide (the operator sits above every Tenant), so they are
 * intentionally not tenant-fenced — but they only ever surface a store NAME and
 * a peso amount, never another Tenant's catalog internals.
 */

export type ActivitySeverity = "info" | "success" | "warning" | "danger";

export interface ActivityEvent {
  /** Stable id so the client can de-dupe / key the row. */
  id: string;
  kind: "sale" | "product" | "health";
  /** For sale/product: the store name. For health: the condition headline. */
  tenant: string;
  /** ISO timestamp the event occurred. */
  at: string;
  /** For sales: the settled total in centavos. null otherwise. */
  amountCents: number | null;
  /** For sales: the BIR reference; for products: the item name; for health: the detail line. */
  detail: string;
  /** Present on `health` condition events; drives the ticker colour. */
  severity?: ActivitySeverity;
}

interface ActivityRow {
  id: string;
  kind: "sale" | "product";
  tenant: string;
  at: Date;
  amount_cents: string | number | null;
  detail: string;
}

/**
 * The most recent cross-tenant events strictly newer than `since` (exclusive),
 * oldest-first so the client can append them to the ticker in order. On the
 * very first poll `since` is the epoch, which backfills the latest slice.
 */
export async function getActivitySince(since: Date, limit = 25): Promise<ActivityEvent[]> {
  const { rows } = await query<ActivityRow>(
    `(
       SELECT s.id::text AS id, 'sale' AS kind, t.name AS tenant,
              s.created_at AS at, s.total_cents AS amount_cents, s.reference AS detail
         FROM sales s
         JOIN tenants t ON t.id = s.tenant_id
        WHERE s.created_at > $1
     )
     UNION ALL
     (
       SELECT p.id::text AS id, 'product' AS kind, t.name AS tenant,
              p.created_at AS at, NULL::int AS amount_cents, p.name AS detail
         FROM products p
         JOIN tenants t ON t.id = p.tenant_id
        WHERE p.created_at > $1
     )
     ORDER BY at ASC
     LIMIT $2`,
    [since.toISOString(), limit],
  );

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    tenant: r.tenant,
    at: r.at.toISOString(),
    amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
    detail: r.detail,
  }));
}

export interface VarianceAlert {
  id: string;
  tenant: string;
  cashierName: string;
  /** counted − expected: + overage / − shortage (centavos). */
  varianceCents: number;
  expectedCashCents: number;
  countedCashCents: number;
  /** ISO timestamp the shift was closed. */
  at: string;
}

interface VarianceRow {
  id: string;
  tenant: string;
  cashier_name: string;
  cash_variance_cents: number;
  expected_cash_cents: number;
  counted_cash_cents: number;
  closed_at: Date;
}

/**
 * Z-Read closures committed since `since` (exclusive) that carry an
 * un-reconciled cash variance — the security flags raised on the System Health
 * overview. Platform-wide (the operator sits above every Tenant).
 */
export async function getVarianceAlertsSince(since: Date, limit = 20): Promise<VarianceAlert[]> {
  const { rows } = await query<VarianceRow>(
    `SELECT cs.id::text AS id, t.name AS tenant, cs.cashier_name,
            cs.cash_variance_cents, cs.expected_cash_cents, cs.counted_cash_cents, cs.closed_at
       FROM cashier_shifts cs
       JOIN tenants t ON t.id = cs.tenant_id
      WHERE cs.status = 'closed' AND cs.cash_variance_cents <> 0 AND cs.closed_at > $1
      ORDER BY cs.closed_at ASC
      LIMIT $2`,
    [since.toISOString(), limit],
  );
  return rows.map((r) => ({
    id: r.id,
    tenant: r.tenant,
    cashierName: r.cashier_name,
    varianceCents: r.cash_variance_cents,
    expectedCashCents: r.expected_cash_cents,
    countedCashCents: r.counted_cash_cents,
    at: r.closed_at.toISOString(),
  }));
}

export interface ServerMetrics {
  /** ISO timestamp the sample was taken. */
  at: string;
  pool: {
    /** Open connections in the pool right now. */
    total: number;
    /** Idle (available) connections. */
    idle: number;
    /** In-flight checkouts borrowing a connection. */
    active: number;
    /** Requests queued, waiting for a free connection. */
    waiting: number;
    /** Pool ceiling (db.ts `max`). */
    max: number;
  };
  /** Round-trip latency of a trivial `SELECT 1`, in milliseconds. */
  latencyMs: number;
}

const POOL_MAX = 5; // mirrors db.ts pool config

/** Sample the live pool occupancy and measure a fresh query round-trip. */
export async function sampleServerMetrics(): Promise<ServerMetrics> {
  const started = process.hrtime.bigint();
  await query(`SELECT 1`);
  const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;

  const total = pool.totalCount;
  const idle = pool.idleCount;
  return {
    at: new Date().toISOString(),
    pool: {
      total,
      idle,
      active: Math.max(0, total - idle),
      waiting: pool.waitingCount,
      max: POOL_MAX,
    },
    latencyMs: Math.round(latencyMs * 10) / 10,
  };
}

// ── Platform-condition events (infra health as live activity) ─────────────────

/**
 * A DB round-trip slower than this reads as degraded latency. Mirrors the
 * threshold the bell's maybeCheckPlatformHealth uses, so the two agree.
 */
const LATENCY_WARN_MS = 750;

/**
 * The last-known condition of each infra signal, carried across stream ticks.
 * We only emit an activity line on a TRANSITION (healthy→bad or bad→healthy),
 * never every tick — so a sustained problem is one "saturated" line, not a flood,
 * and its clearing is one "recovered" line.
 */
export interface ConditionState {
  poolSaturated: boolean;
  latencyHigh: boolean;
}

export const INITIAL_CONDITION_STATE: ConditionState = {
  poolSaturated: false,
  latencyHigh: false,
};

/**
 * Compare a fresh metrics sample against the prior condition state and return
 * any transition events (plus the new state to carry forward). Pure — all the
 * stream router does is thread the state through.
 */
export function detectConditionEvents(
  m: ServerMetrics,
  prev: ConditionState,
): { events: ActivityEvent[]; state: ConditionState } {
  const events: ActivityEvent[] = [];
  const nowSaturated = m.pool.waiting > 0 || m.pool.active >= m.pool.max;
  const nowLatencyHigh = m.latencyMs > LATENCY_WARN_MS;

  if (nowSaturated && !prev.poolSaturated) {
    events.push(
      conditionEvent(
        "pool",
        "danger",
        "Connection pool saturated",
        `${m.pool.active}/${m.pool.max} connections in use` +
          (m.pool.waiting > 0 ? `, ${m.pool.waiting} request(s) waiting.` : "."),
      ),
    );
  } else if (!nowSaturated && prev.poolSaturated) {
    events.push(
      conditionEvent(
        "pool",
        "success",
        "Connection pool recovered",
        `Back to ${m.pool.active}/${m.pool.max} connections in use.`,
      ),
    );
  }

  if (nowLatencyHigh && !prev.latencyHigh) {
    events.push(
      conditionEvent(
        "latency",
        "warning",
        "Database latency high",
        `Query round-trip is ${Math.round(m.latencyMs)} ms.`,
      ),
    );
  } else if (!nowLatencyHigh && prev.latencyHigh) {
    events.push(
      conditionEvent(
        "latency",
        "success",
        "Database latency back to normal",
        `Query round-trip is ${Math.round(m.latencyMs)} ms.`,
      ),
    );
  }

  return { events, state: { poolSaturated: nowSaturated, latencyHigh: nowLatencyHigh } };
}

/** Build a synthetic `health` activity event. The id is unique per transition. */
function conditionEvent(
  signal: "pool" | "latency",
  severity: ActivitySeverity,
  headline: string,
  detail: string,
): ActivityEvent {
  return {
    id: `health:${signal}:${severity}:${Date.now()}`,
    kind: "health",
    tenant: headline,
    at: new Date().toISOString(),
    amountCents: null,
    detail,
    severity,
  };
}
