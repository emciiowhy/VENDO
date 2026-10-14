"use client";

import Link from "next/link";
import { Icon } from "../Icon";
import type { SessionUser } from "@/lib/auth";

/**
 * A slim "Trial ends in X days" strip at the top of the owner workspace, shown
 * only while the store is inside its trial window (session status `trial`). It's
 * the pre-expiry counterpart of <TrialRecovery />: that view takes over once the
 * trial has lapsed, whereas this nudges ahead of time so the lockout is never a
 * surprise. The tone escalates as the deadline nears (info → warning → danger),
 * mirroring the 7/3/1-day reminder milestones, and the CTA routes to the same
 * plan-selection surface the recovery view uses.
 *
 * SUPER_ADMIN sessions carry no tenant status, so this never renders on the
 * platform console — it self-gates on `status === 'trial'`.
 */
export function TrialCountdownBanner({ user }: { user: SessionUser }) {
  if (user.status !== "trial" || !user.trialEndsAt) return null;
  const daysLeft = trialDaysLeft(user.trialEndsAt, new Date());
  const endsOn = formatEndDate(user.trialEndsAt);
  const tone = toneFor(daysLeft);

  return (
    <div
      role="status"
      className={
        "mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl2 px-4 py-3 hairline " +
        tone.wrap
      }
    >
      <span className={"grid place-items-center w-8 h-8 rounded-[9px] shrink-0 " + tone.badge}>
        <Icon name="bolt" className="w-[17px] h-[17px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0 text-[13.5px] leading-snug">
        <span className="font-extrabold text-ink">{countdownLabel(daysLeft)}</span>
        {endsOn && <span className="text-ink-soft"> · your free trial ends {endsOn}</span>}
        <span className="text-ink-soft"> — pick a plan to keep your store and data active.</span>
      </div>
      <Link
        href="/#pricing"
        className={
          "ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-bold text-white shadow-btn tracking-tight transition duration-150 " +
          tone.cta
        }
      >
        Choose a plan
        <Icon name="arrow" className="w-[15px] h-[15px]" strokeWidth={2} />
      </Link>
    </div>
  );
}

/**
 * Whole days remaining until the trial closes, rounded UP so a partial final day
 * reads as "1 day left" rather than "0". Never negative — a lapsed trial is the
 * recovery view's job, not this banner's. Exported for direct reasoning/testing.
 */
export function trialDaysLeft(trialEndsAt: string, now: Date): number {
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

/** "6 days left" / "1 day left" / "Last day of your trial". */
function countdownLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "Last day of your trial";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

/** Tone escalates with urgency, aligned to the 7/3/1-day reminder marks. */
function toneFor(daysLeft: number): { wrap: string; badge: string; cta: string } {
  if (daysLeft <= 1) {
    return {
      wrap: "bg-rose-50 border-rose-200",
      badge: "bg-rose-100 text-rose-600",
      cta: "bg-rose-600 hover:bg-rose-700",
    };
  }
  if (daysLeft <= 3) {
    return {
      wrap: "bg-amber-50 border-amber-200",
      badge: "bg-amber-100 text-amber-700",
      cta: "bg-amber-600 hover:bg-amber-700",
    };
  }
  return {
    wrap: "bg-brand-50 border-brand-200",
    badge: "bg-brand-100 text-brand-600",
    cta: "bg-brand-500 hover:bg-brand-600",
  };
}

/** Trial-end ISO → plain calendar date, or null when absent/invalid. */
function formatEndDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
