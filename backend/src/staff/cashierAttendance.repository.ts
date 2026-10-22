import { query } from "../db.js";
import {
  groupByDay,
  toPunch,
  totalsOf,
  type CashierAttendanceTotals,
  type CashierDay,
  type RawPunch,
} from "./cashierAttendance.js";

/**
 * Cashier attendance data access — reads the labor clock (`timecards`) for the
 * store's CASHIER logins. Every query is fenced to the session's `tenantId` and
 * to `role = 'CASHIER'`, so an owner only ever sees their own store's cashiers.
 * A punch is attributed to the Manila day it started on.
 */
const MNL = "Asia/Manila";

interface PunchRow {
  id: string;
  user_id: string;
  clock_in: Date;
  clock_out: Date | null;
  needs_review: boolean;
}

async function punchesIn(tenantId: string, start: string, end: string, userId?: string): Promise<PunchRow[]> {
  const { rows } = await query<PunchRow>(
    `SELECT t.id, t.user_id, t.clock_in, t.clock_out, t.needs_review
       FROM timecards t
       JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id AND u.role = 'CASHIER'
      WHERE t.tenant_id = $1
        AND t.clock_in >= ($2::date::timestamp AT TIME ZONE '${MNL}')
        AND t.clock_in <  ((($3::date + 1)::timestamp) AT TIME ZONE '${MNL}')
        AND ($4::uuid IS NULL OR t.user_id = $4::uuid)
      ORDER BY t.clock_in`,
    [tenantId, start, end, userId ?? null],
  );
  return rows;
}

const raw = (r: PunchRow): RawPunch => ({
  id: r.id,
  clockIn: r.clock_in,
  clockOut: r.clock_out,
  needsReview: r.needs_review,
});

export interface CashierAttendanceRow extends CashierAttendanceTotals {
  userId: string;
  name: string;
  status: string;
  /** On the clock right now. */
  onClock: boolean;
}

export interface StoreAttendanceDay {
  date: string;
  workedMinutes: number;
  /** How many cashiers clocked any hours that day. */
  cashiers: number;
  needsReview: boolean;
}

/**
 * The month for every cashier: their totals (one row each, including cashiers
 * with no hours) plus a store-wide per-day rollup for the calendar.
 */
export async function getStoreCashierAttendance(
  tenantId: string,
  start: string,
  end: string,
  now: Date = new Date(),
): Promise<{ rows: CashierAttendanceRow[]; days: StoreAttendanceDay[] }> {
  const [cashiers, punches, open] = await Promise.all([
    query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM users WHERE tenant_id = $1 AND role = 'CASHIER' ORDER BY lower(name)`,
      [tenantId],
    ),
    punchesIn(tenantId, start, end),
    // "On the clock" is about right now, whatever month is being viewed.
    query<{ user_id: string }>(
      `SELECT user_id FROM timecards
        WHERE tenant_id = $1 AND status = 'ACTIVE'
          AND (clock_in AT TIME ZONE '${MNL}')::date = (now() AT TIME ZONE '${MNL}')::date`,
      [tenantId],
    ),
  ]);
  const onClock = new Set(open.rows.map((r) => r.user_id));

  const daysByUser = new Map<string, CashierDay[]>();
  const perUser = new Map<string, PunchRow[]>();
  for (const p of punches) perUser.set(p.user_id, [...(perUser.get(p.user_id) ?? []), p]);
  for (const [userId, list] of perUser) daysByUser.set(userId, groupByDay(list.map((p) => toPunch(raw(p), now))));

  const rows = cashiers.rows.map((c) => ({
    userId: c.id,
    name: c.name,
    status: c.status,
    onClock: onClock.has(c.id),
    ...totalsOf(daysByUser.get(c.id) ?? []),
  }));

  const store = new Map<string, StoreAttendanceDay>();
  for (const days of daysByUser.values()) {
    for (const d of days) {
      const s = store.get(d.date) ?? { date: d.date, workedMinutes: 0, cashiers: 0, needsReview: false };
      s.workedMinutes += d.workedMinutes;
      if (d.workedMinutes > 0) s.cashiers += 1;
      s.needsReview ||= d.needsReview;
      store.set(d.date, s);
    }
  }
  return { rows, days: [...store.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** One cashier's month: every day with its punches, and the totals. Null if not this store's cashier. */
export async function getCashierAttendance(
  tenantId: string,
  userId: string,
  start: string,
  end: string,
  now: Date = new Date(),
): Promise<{ cashier: { id: string; name: string; status: string }; days: CashierDay[]; totals: CashierAttendanceTotals } | null> {
  const { rows } = await query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'CASHIER'`,
    [userId, tenantId],
  );
  const cashier = rows[0];
  if (!cashier) return null;
  const days = groupByDay((await punchesIn(tenantId, start, end, userId)).map((p) => toPunch(raw(p), now)));
  return { cashier, days, totals: totalsOf(days) };
}

/** Whether a timecard belongs to one of this store's cashiers (so the owner may correct it here). */
export async function isCashierTimecard(tenantId: string, timecardId: string): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM timecards t
       JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id AND u.role = 'CASHIER'
      WHERE t.id = $1 AND t.tenant_id = $2`,
    [timecardId, tenantId],
  );
  return rows.length > 0;
}
