import { pool, query } from "../db.js";
import { markPresentFromShift } from "./hr.repository.js";
import type {
  ActiveStaffMember,
  CashierEfficiencyRow,
  ClockStatus,
  LaborAnalytics,
  MyTimecards,
  Timecard,
} from "./timecard.schema.js";

/**
 * Data access for the labor shift-clock (timecards). EVERY query is scoped by
 * `tenantId` (read from the verified session, never the body); the punch
 * functions additionally scope by `userId` so a worker can only ever touch
 * their own clock. A user may hold at most one ACTIVE timecard per tenant — the
 * partial unique index `timecards_one_active_per_user` is the real guard, so two
 * concurrent clock-ins resolve to one row rather than a race.
 */
const MNL = "Asia/Manila";

interface TimecardRow {
  id: string;
  user_id: string;
  clock_in: Date;
  clock_out: Date | null;
  status: string;
}

const COLS = "id, user_id, clock_in, clock_out, status";

/**
 * Whole minutes between a clock-in and its (possibly still-open) clock-out.
 * An open card measures against `now`. Pure + injectable `now` so the duration
 * maths is unit-testable without a clock or a database.
 */
export function elapsedMinutes(clockIn: Date, clockOut: Date | null, now: Date = new Date()): number {
  const end = clockOut ?? now;
  return Math.max(0, Math.round((end.getTime() - clockIn.getTime()) / 60_000));
}

function toTimecard(row: TimecardRow, now: Date = new Date()): Timecard {
  return {
    id: row.id,
    userId: row.user_id,
    clockIn: row.clock_in.toISOString(),
    clockOut: row.clock_out ? row.clock_out.toISOString() : null,
    status: row.status === "COMPLETED" ? "COMPLETED" : "ACTIVE",
    durationMinutes: elapsedMinutes(row.clock_in, row.clock_out, now),
  };
}

// ── The caller's own clock ─────────────────────────────────────────────────

/** The caller's currently-open timecard, or null when off the clock. */
export async function getActiveTimecard(tenantId: string, userId: string): Promise<Timecard | null> {
  const { rows } = await query<TimecardRow>(
    `SELECT ${COLS} FROM timecards
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'ACTIVE'
      LIMIT 1`,
    [tenantId, userId],
  );
  return rows[0] ? toTimecard(rows[0]) : null;
}

export type ClockInResult =
  | { ok: true; timecard: Timecard }
  | { ok: false; reason: "already_active"; timecard: Timecard };

/**
 * Punch in. Idempotent-ish: if the caller already has an open card we return it
 * with `already_active` rather than opening a second one. The pre-check covers
 * the common case; the unique-violation catch covers a genuine race (two punches
 * landing at once) so the engine never creates a duplicate active session.
 * Best-effort: opening a card also stamps the linked employee Present for the
 * day — the same attendance signal a drawer-shift open produces — but a failure
 * there never fails the punch.
 */
export async function clockIn(tenantId: string, userId: string): Promise<ClockInResult> {
  const existing = await getActiveTimecard(tenantId, userId);
  if (existing) return { ok: false, reason: "already_active", timecard: existing };
  try {
    const { rows } = await query<TimecardRow>(
      `INSERT INTO timecards (tenant_id, user_id) VALUES ($1, $2) RETURNING ${COLS}`,
      [tenantId, userId],
    );
    try {
      await markPresentFromShift(tenantId, userId);
    } catch (err) {
      console.error("[timecard] auto-attendance stamp failed (non-fatal):", err);
    }
    return { ok: true, timecard: toTimecard(rows[0]) };
  } catch (err) {
    // 23505 = unique_violation on timecards_one_active_per_user (concurrent punch).
    if ((err as { code?: string }).code === "23505") {
      const active = await getActiveTimecard(tenantId, userId);
      if (active) return { ok: false, reason: "already_active", timecard: active };
    }
    throw err;
  }
}

export type ClockOutResult =
  | { ok: true; timecard: Timecard }
  | { ok: false; reason: "not_active" };

/** Punch out the caller's open card. No-op-safe: returns `not_active` when the
 *  caller wasn't clocked in (so a double clock-out can't close someone else's). */
export async function clockOut(tenantId: string, userId: string): Promise<ClockOutResult> {
  const { rows } = await query<TimecardRow>(
    `UPDATE timecards SET clock_out = now(), status = 'COMPLETED'
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'ACTIVE'
      RETURNING ${COLS}`,
    [tenantId, userId],
  );
  if (!rows[0]) return { ok: false, reason: "not_active" };
  return { ok: true, timecard: toTimecard(rows[0]) };
}

/** The caller's clock state + minutes worked today (Manila), for the POS widget. */
export async function getClockStatus(tenantId: string, userId: string): Promise<ClockStatus> {
  const [active, today] = await Promise.all([
    getActiveTimecard(tenantId, userId),
    query<{ minutes: string }>(
      `SELECT coalesce(sum(EXTRACT(EPOCH FROM (coalesce(clock_out, now()) - clock_in))), 0) / 60 AS minutes
         FROM timecards
        WHERE tenant_id = $1 AND user_id = $2
          AND (clock_in AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
      [tenantId, userId, MNL],
    ),
  ]);
  return { timecard: active, todayMinutes: Math.round(Number(today.rows[0]?.minutes ?? 0)) };
}

/** The caller's recent timecards + rolling week/month totals (self-service). */
export async function getMyTimecards(tenantId: string, userId: string, limit = 60): Promise<MyTimecards> {
  const [history, totals] = await Promise.all([
    query<TimecardRow>(
      `SELECT ${COLS} FROM timecards
        WHERE tenant_id = $1 AND user_id = $2
        ORDER BY clock_in DESC
        LIMIT $3`,
      [tenantId, userId, limit],
    ),
    query<{ week: string; month: string }>(
      `SELECT
         coalesce(sum(EXTRACT(EPOCH FROM (coalesce(clock_out, now()) - clock_in)))
           FILTER (WHERE clock_in >= date_trunc('week', now() AT TIME ZONE $3)), 0) / 60 AS week,
         coalesce(sum(EXTRACT(EPOCH FROM (coalesce(clock_out, now()) - clock_in)))
           FILTER (WHERE clock_in >= date_trunc('month', now() AT TIME ZONE $3)), 0) / 60 AS month
         FROM timecards
        WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId, MNL],
    ),
  ]);
  const now = new Date();
  return {
    timecards: history.rows.map((r) => toTimecard(r, now)),
    weekMinutes: Math.round(Number(totals.rows[0]?.week ?? 0)),
    monthMinutes: Math.round(Number(totals.rows[0]?.month ?? 0)),
  };
}

// ── Owner / manager labor analytics ─────────────────────────────────────────

/** PH default baseline hourly rate (centavos) when the owner hasn't set one. */
export const DEFAULT_HOURLY_RATE_CENTS = 11_000; // ₱110/hr

/**
 * Labor analytics over [from, to] (inclusive ISO dates, evaluated in Manila):
 *   • activeStaff   — who's on the clock right now (live durations)
 *   • labor-to-sales — total worked hours, gross sales, and the labor-cost ratio
 *   • cashier matrix — per-cashier hours, orders, revenue, throughput + est. pay
 * Timecards are attributed to the day a punch STARTED. The payroll log multiplies
 * each cashier's worked hours by `hourlyRateCents`. Strictly tenant-fenced.
 */
export async function getLaborAnalytics(
  tenantId: string,
  from: string,
  to: string,
  hourlyRateCents: number = DEFAULT_HOURLY_RATE_CENTS,
): Promise<LaborAnalytics> {
  const [active, labor, sales, gross, people] = await Promise.all([
    // Who is on the clock right now (across the whole store).
    query<{ user_id: string; name: string; clock_in: Date }>(
      `SELECT t.user_id, u.name, t.clock_in
         FROM timecards t JOIN users u ON u.id = t.user_id
        WHERE t.tenant_id = $1 AND t.status = 'ACTIVE'
        ORDER BY t.clock_in ASC`,
      [tenantId],
    ),
    // Worked minutes per user inside the window (open punches clipped to now()).
    query<{ user_id: string; minutes: string }>(
      `SELECT user_id,
              coalesce(sum(EXTRACT(EPOCH FROM (coalesce(clock_out, now()) - clock_in))), 0) / 60 AS minutes
         FROM timecards
        WHERE tenant_id = $1 AND (clock_in AT TIME ZONE $4)::date BETWEEN $2 AND $3
        GROUP BY user_id`,
      [tenantId, from, to, MNL],
    ),
    // Net of nothing — GROSS sales + order count per cashier in the window.
    query<{ cashier_user_id: string; revenue: string; orders: string }>(
      `SELECT cashier_user_id,
              coalesce(sum(total_cents), 0) AS revenue,
              count(*) AS orders
         FROM sales
        WHERE tenant_id = $1 AND kind = 'sale' AND cashier_user_id IS NOT NULL
          AND (created_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
        GROUP BY cashier_user_id`,
      [tenantId, from, to, MNL],
    ),
    // Store-wide gross sales in the window (the labor-to-sales denominator).
    query<{ gross: string }>(
      `SELECT coalesce(sum(total_cents), 0) AS gross
         FROM sales
        WHERE tenant_id = $1 AND kind = 'sale'
          AND (created_at AT TIME ZONE $3)::date BETWEEN $2 AND $3`,
      [tenantId, from, to, MNL],
    ),
    // Names for every store user (so a sales-only cashier still resolves a name).
    query<{ id: string; name: string }>(`SELECT id, name FROM users WHERE tenant_id = $1`, [tenantId]),
  ]);

  const nameById = new Map(people.rows.map((r) => [r.id, r.name]));
  const laborByUser = new Map(labor.rows.map((r) => [r.user_id, Math.round(Number(r.minutes))]));
  const salesByUser = new Map(
    sales.rows.map((r) => [r.cashier_user_id, { revenue: Number(r.revenue), orders: Number(r.orders) }]),
  );

  const now = new Date();
  const activeStaff: ActiveStaffMember[] = active.rows.map((r) => ({
    userId: r.user_id,
    name: r.name,
    clockIn: r.clock_in.toISOString(),
    elapsedMinutes: elapsedMinutes(r.clock_in, null, now),
  }));

  // Every user who either worked or sold in the window earns a matrix row.
  const userIds = new Set<string>([...laborByUser.keys(), ...salesByUser.keys()]);
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const cashiers: CashierEfficiencyRow[] = [...userIds]
    .map((userId) => {
      const laborMinutes = laborByUser.get(userId) ?? 0;
      const laborHours = laborMinutes / 60;
      const s = salesByUser.get(userId) ?? { revenue: 0, orders: 0 };
      return {
        userId,
        name: nameById.get(userId) ?? "Unknown",
        laborMinutes,
        laborHours: round1(laborHours),
        orders: s.orders,
        revenueCents: s.revenue,
        revenuePerHourCents: laborHours > 0 ? Math.round(s.revenue / laborHours) : 0,
        avgOrderCents: s.orders > 0 ? Math.round(s.revenue / s.orders) : 0,
        minutesPerOrder: s.orders > 0 ? round1(laborMinutes / s.orders) : 0,
        payCents: Math.round(laborHours * hourlyRateCents),
      };
    })
    .sort((a, b) => b.revenuePerHourCents - a.revenuePerHourCents);

  const laborMinutes = [...laborByUser.values()].reduce((s, m) => s + m, 0);
  const laborHours = laborMinutes / 60;
  const grossSalesCents = Number(gross.rows[0]?.gross ?? 0);
  const laborCostCents = Math.round(laborHours * hourlyRateCents);

  return {
    from,
    to,
    hourlyRateCents,
    laborMinutes,
    laborHours: round1(laborHours),
    grossSalesCents,
    laborCostCents,
    laborCostPct: grossSalesCents > 0 ? Math.round((laborCostCents / grossSalesCents) * 100) : 0,
    salesPerLaborHourCents: laborHours > 0 ? Math.round(grossSalesCents / laborHours) : 0,
    activeStaff,
    cashiers,
  };
}
