"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { getAuditTrail, type AuditAction, type AuditRow } from "@/lib/adminAudit";

/**
 * The platform control-plane audit trail — every privileged Super Admin action,
 * newest first. Where pos_audit_logs holds a cashier's floor actions within a
 * store, this holds the operator's actions ABOVE every store: plan moves,
 * workspace suspensions, broadcasts and profile edits. Read-only; the ledger is
 * written at each action's own seam. An activity feed, not a table — each entry
 * reads as a sentence (who did what, to whom, when) so accountability is legible
 * at a glance rather than decoded column by column.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AuditRow[] };

type ActionMeta = { label: string; icon: IconName; tone: string };

const ACTION: Record<AuditAction, ActionMeta> = {
  tenant_plan_change: { label: "Plan change", icon: "tag", tone: "bg-brand-50 text-brand-600" },
  tenant_status_change: { label: "Status change", icon: "ban", tone: "bg-amber-50 text-amber-600" },
  broadcast: { label: "Broadcast", icon: "bolt", tone: "bg-accent-50 text-accent-600" },
  profile_update: { label: "Profile", icon: "gear", tone: "bg-paper text-ink-soft" },
  owner_password_reset: { label: "Password reset", icon: "lock", tone: "bg-brand-50 text-brand-600" },
  onboarding_resend: { label: "Onboarding resent", icon: "refresh", tone: "bg-accent-50 text-accent-600" },
  shift_force_close: { label: "Shift force-closed", icon: "clock", tone: "bg-amber-50 text-amber-600" },
  lead_edit: { label: "Lead edited", icon: "pencil", tone: "bg-paper text-ink-soft" },
  lead_delete: { label: "Lead deleted", icon: "trash", tone: "bg-rose-50 text-rose-600" },
};

/**
 * Resolve an action's display meta, tolerating an action the client doesn't yet
 * know about (e.g. a newer backend). A missing entry must degrade to a neutral
 * chip, never crash the whole trail — this page reading `.tone`/`.icon` off an
 * unmapped action is exactly what broke it before.
 */
function actionMeta(action: string): ActionMeta {
  return (ACTION as Record<string, ActionMeta>)[action] ?? {
    label: action.replace(/_/g, " "),
    icon: "activity",
    tone: "bg-paper text-ink-soft",
  };
}

export function AuditTrail() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getAuditTrail();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", rows: res.entries });
      else setState({ status: "error", message: res.error ?? "Could not load the audit trail." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden max-w-[920px]">
      <div className="px-5 sm:px-6 py-4 hairline-b">
        <h2 className="font-extrabold tracking-tight">Control-plane activity</h2>
        <p className="text-fine text-ink-soft">
          {state.status === "ready"
            ? `${state.rows.length} most recent privileged action${state.rows.length === 1 ? "" : "s"}`
            : "Loading the audit trail…"}
        </p>
      </div>

      {state.status === "loading" && (
        <div className="divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.09)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 sm:px-6 py-4">
              <div className="h-9 rounded-[10px] bg-paper hairline animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="px-6 py-12 text-center text-note text-rose-600 font-semibold">
          {state.message}
        </p>
      )}

      {state.status === "ready" && state.rows.length === 0 && (
        <div className="px-6 py-14 text-center">
          <span className="inline-grid place-items-center w-11 h-11 rounded-full bg-paper hairline text-ink-faint mb-3">
            <Icon name="shield" className="w-5 h-5" strokeWidth={1.7} />
          </span>
          <p className="font-bold tracking-tight">No activity yet</p>
          <p className="mt-1 text-fine text-ink-soft">
            Privileged actions will appear here as they happen.
          </p>
        </div>
      )}

      {state.status === "ready" && state.rows.length > 0 && (
        <ul className="divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.09)]">
          {state.rows.map((r) => {
            const meta = actionMeta(r.action);
            return (
            <li key={r.id} className="flex items-center gap-4 px-5 sm:px-6 py-3.5">
              <span className={"grid place-items-center w-9 h-9 rounded-[10px] shrink-0 " + meta.tone}>
                <Icon name={meta.icon} className="w-[18px] h-[18px]" strokeWidth={1.6} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-note">
                  <span className="font-bold tracking-tight">{r.actorName}</span>
                  <span className="text-ink-soft"> · {meta.label}</span>
                  {r.targetName && (
                    <span className="text-ink-soft">
                      {" → "}
                      <span className="font-semibold text-ink">{r.targetName}</span>
                    </span>
                  )}
                </div>
                {r.detail && <div className="text-fine text-ink-faint truncate">{r.detail}</div>}
              </div>
              <time className="text-fine text-ink-faint tabular-nums whitespace-nowrap shrink-0">
                {formatWhen(r.createdAt)}
              </time>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Compact timestamp: "Oct 6, 2:34 PM" in PH locale. */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
