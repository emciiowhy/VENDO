import { query } from "../db.js";
import { notifyTrialEnding } from "../notifications/notifications.repository.js";

/**
 * Trial-ending reminders — the pre-expiry counterpart of billing/trial.ts.
 *
 * While the lazy expiry engine flips a lapsed trial to `trial_expired` and fires
 * the recovery email, THIS module nudges the owner at 7, 3 and 1 days BEFORE the
 * window closes so the lockout is never a surprise. Like the expiry engine there
 * is no background worker: the sweep rides the owner's own authenticated poll
 * (evaluateTenantStatus, on /auth/me and the trial checkpoint) and, for a cadence
 * independent of logins, a daily cron endpoint — both call the same idempotent
 * core here.
 *
 * At-most-once is guaranteed at the data layer, not by the trigger: each milestone
 * is a bit in `tenants.trial_reminders_sent`, claimed with an atomic conditional
 * UPDATE (the same lock pattern as `expireTrial`). Only the request that flips the
 * bit fires that milestone's notification, so poll + cron landing the same day can
 * never double-send. The pure `computeDueTrialReminders` decides WHAT is owed from
 * an injected clock, so it unit-tests without a database or a real `Date.now()`.
 */

/** The reminder milestones, in days-before-expiry, widest first. */
export const TRIAL_REMINDER_DAYS = [7, 3, 1] as const;
export type TrialReminderDay = (typeof TRIAL_REMINDER_DAYS)[number];

/** Bitmask position for each milestone (bit 0 = 7-day, bit 1 = 3-day, bit 2 = 1-day). */
const MILESTONE_BIT: Record<TrialReminderDay, number> = { 7: 1, 3: 2, 1: 4 };

const DAY_MS = 86_400_000;

/** Fractional days from `now` until the trial closes (negative once it has lapsed). */
export function daysUntil(trialEndsAt: Date, now: Date): number {
  return (trialEndsAt.getTime() - now.getTime()) / DAY_MS;
}

export interface DueInput {
  /** When the trial window closes; null for a non-trial store. */
  trialEndsAt: Date | null;
  /** The `trial_reminders_sent` bitmask already persisted for the store. */
  sentMask: number;
  /** Injected clock — pass `new Date()` in production. */
  now: Date;
}

/**
 * The milestones newly due for a store: those whose threshold the remaining
 * window has reached and which haven't fired yet. A milestone `m` is due when
 * `0 < daysLeft <= m` and its bit is unset — so a trial first seen with only a
 * few days left fires the still-applicable nudges (e.g. 3 and 1) but never a
 * retro-active 7, and a lapsed window (`daysLeft <= 0`) yields nothing because
 * the expiry engine owns that transition. Returned widest-first.
 */
export function computeDueTrialReminders(input: DueInput): TrialReminderDay[] {
  const { trialEndsAt, sentMask, now } = input;
  if (!trialEndsAt) return [];
  const left = daysUntil(trialEndsAt, now);
  if (left <= 0) return [];
  return TRIAL_REMINDER_DAYS.filter((d) => left <= d && (sentMask & MILESTONE_BIT[d]) === 0);
}

/** The bitmask after marking `days` sent (pure; for tests and composition). */
export function markSent(sentMask: number, days: readonly TrialReminderDay[]): number {
  return days.reduce((mask, d) => mask | MILESTONE_BIT[d], sentMask);
}

/**
 * Atomically claim one milestone: flip its bit only if still unset. Returns true
 * iff THIS call won it (so it alone fires the reminder). Mirrors `expireTrial`'s
 * single-winner UPDATE — a concurrent poll + cron can't both claim the same bit.
 */
async function claimMilestone(tenantId: string, day: TrialReminderDay): Promise<boolean> {
  const bit = MILESTONE_BIT[day];
  const { rowCount } = await query(
    `UPDATE tenants
        SET trial_reminders_sent = trial_reminders_sent | $2
      WHERE id = $1
        AND status = 'trial'
        AND (trial_reminders_sent & $2) = 0`,
    [tenantId, bit],
  );
  return (rowCount ?? 0) > 0;
}

/** Everything a fired reminder needs about the store/owner (from the trial snapshot). */
export interface TrialReminderContext {
  tenantId: string;
  trialEndsAt: Date;
  sentMask: number;
  storeName: string;
  plan: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

/**
 * Fire every due trial-ending reminder for a store, each exactly once. For each
 * milestone we claim its bit (the lock) and, only on the winning call, raise the
 * owner/manager bell notification. Best-effort end to end: a failure is logged and
 * swallowed so it can never disturb the request (a poll, or the cron sweep) that
 * happened to trip it. Returns how many milestones this call actually fired.
 */
export async function runTrialReminders(ctx: TrialReminderContext): Promise<number> {
  let fired = 0;
  try {
    const due = computeDueTrialReminders({
      trialEndsAt: ctx.trialEndsAt,
      sentMask: ctx.sentMask,
      now: new Date(),
    });
    for (const day of due) {
      const won = await claimMilestone(ctx.tenantId, day);
      if (!won) continue;
      await notifyTrialEnding({
        tenantId: ctx.tenantId,
        day,
        trialEndsAt: ctx.trialEndsAt,
      });
      fired += 1;
    }
  } catch (err) {
    console.error("[trial] trial-ending reminder sweep failed:", err);
  }
  return fired;
}
