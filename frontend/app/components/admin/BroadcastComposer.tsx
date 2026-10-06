"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { ConfirmDialog } from "../ConfirmDialog";
import { PLAN_LABEL, type Plan } from "./tenants.data";
import {
  getRecipientCount,
  sendBroadcast,
  type BroadcastSeverity,
} from "@/lib/adminBroadcast";

/**
 * The platform broadcaster — one composer that fans a notice out to every
 * targeted merchant's notification bell via the existing pipeline. A broadcast
 * is outward-facing and irreversible (it lands in real merchants' bells), so the
 * screen is built around *seeing before sending*: a live bell preview renders
 * exactly what merchants will see, and a confirm step names the recipient count
 * the admin is about to reach. Severity drives the colour the same way the bell
 * does, so the preview is honest.
 */

type Audience = "all" | Plan;

const SEVERITIES: { value: BroadcastSeverity; label: string; icon: IconName; dot: string; tint: string }[] = [
  { value: "info", label: "Info", icon: "bell", dot: "bg-brand-500", tint: "bg-brand-50 text-brand-600" },
  { value: "success", label: "Success", icon: "check", dot: "bg-accent-500", tint: "bg-accent-50 text-accent-600" },
  { value: "warning", label: "Warning", icon: "activity", dot: "bg-amber-500", tint: "bg-amber-50 text-amber-600" },
  { value: "danger", label: "Urgent", icon: "ban", dot: "bg-rose-500", tint: "bg-rose-50 text-rose-600" },
];

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "all", label: "All stores" },
  { value: "starter", label: PLAN_LABEL.starter },
  { value: "business", label: PLAN_LABEL.business },
  { value: "enterprise", label: PLAN_LABEL.enterprise },
];

const TITLE_MAX = 120;
const BODY_MAX = 500;

export function BroadcastComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<BroadcastSeverity>("info");
  const [audience, setAudience] = useState<Audience>("all");

  const [result, setResult] = useState<{ forPlan: Plan | null; count: number | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ delivered: number; audience: string } | null>(null);

  const plan: Plan | null = audience === "all" ? null : audience;

  // Loading is DERIVED, never set synchronously in the effect: the count is
  // "loading" until a result lands that was fetched for the current audience.
  const countLoading = !result || result.forPlan !== plan;
  const count = countLoading ? null : result.count;

  // Recipient preview — refetched whenever the audience filter changes, so the
  // number the admin confirms always matches what will actually fan out.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getRecipientCount(plan);
      if (!alive) return;
      setResult({ forPlan: plan, count: res.ok ? res.count : null });
    })();
    return () => {
      alive = false;
    };
  }, [plan]);

  const sev = SEVERITIES.find((s) => s.value === severity)!;
  const canSend = title.trim().length > 0 && !sending && (count ?? 0) > 0;

  async function doSend() {
    setConfirming(false);
    setSending(true);
    setError(null);
    const res = await sendBroadcast({ title: title.trim(), body: body.trim(), severity, plan });
    setSending(false);
    if (res.ok) {
      setSent({ delivered: res.delivered, audience: res.audience });
    } else {
      setError(res.error ?? "Could not send the broadcast.");
    }
  }

  function reset() {
    setTitle("");
    setBody("");
    setSeverity("info");
    setAudience("all");
    setSent(null);
    setError(null);
  }

  if (sent) {
    return (
      <section className="max-w-[560px] rounded-xl2 bg-surface hairline-strong shadow-soft p-8 text-center">
        <span className="inline-grid place-items-center w-14 h-14 rounded-full bg-accent-50 text-accent-600 mb-4">
          <Icon name="check" className="w-7 h-7" strokeWidth={2.2} />
        </span>
        <h2 className="text-title font-extrabold tracking-tight">Broadcast sent</h2>
        <p className="mt-2 text-note text-ink-soft">
          Delivered to{" "}
          <span className="font-bold text-ink tabular-nums">{sent.delivered}</span>{" "}
          merchant{sent.delivered === 1 ? "" : "s"} · {sent.audience}. It&apos;s now in their
          notification bell.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 px-5 py-2.5 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150"
        >
          <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />
          Compose another
        </button>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] max-w-[1040px] items-start">
      {/* Composer */}
      <section className="rounded-xl2 bg-surface hairline-strong shadow-soft p-6">
        <h2 className="font-extrabold tracking-tight">Compose a notice</h2>
        <p className="text-fine text-ink-soft mt-0.5">
          Reaches active stores only — suspended and lapsed-trial workspaces are skipped.
        </p>

        {error && (
          <p className="mt-4 text-note font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-5">
          <Field label="Headline" hint={`${title.length}/${TITLE_MAX}`}>
            <input
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Scheduled maintenance this Sunday"
              className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note font-semibold"
            />
          </Field>

          <Field label="Message" hint={`${body.length}/${BODY_MAX}`}>
            <textarea
              value={body}
              maxLength={BODY_MAX}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Add the detail merchants need. Optional — the headline alone is enough for a short alert."
              className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note resize-y leading-relaxed"
            />
          </Field>

          <Field label="Severity">
            <div className="grid grid-cols-4 gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-[10px] py-2.5 text-cap font-bold tracking-wide transition duration-150 " +
                    (severity === s.value
                      ? s.tint + " ring-2 ring-current"
                      : "hairline text-ink-soft hover:bg-paper")
                  }
                >
                  <Icon name={s.icon} className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Audience">
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  className={
                    "rounded-[10px] px-3.5 py-2 text-note font-semibold transition duration-150 " +
                    (audience === a.value
                      ? "bg-brand-50 text-brand-700 ring-2 ring-brand-200"
                      : "hairline text-ink-soft hover:bg-paper")
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </section>

      {/* Live preview + send */}
      <aside className="rounded-xl2 bg-surface hairline shadow-card p-6 lg:sticky lg:top-24">
        <div className="text-cap font-bold tracking-wide text-ink-faint uppercase">Bell preview</div>

        {/* How the notice renders in a merchant's notification bell. */}
        <div className="mt-3 rounded-[12px] bg-paper hairline p-3.5">
          <div className="flex items-start gap-2.5">
            <span className={"mt-0.5 grid place-items-center w-7 h-7 rounded-full shrink-0 " + sev.tint}>
              <span className={"w-2 h-2 rounded-full " + sev.dot} />
            </span>
            <div className="min-w-0">
              <div className="font-bold tracking-tight text-note break-words">
                {title.trim() || <span className="text-ink-faint">Your headline…</span>}
              </div>
              {body.trim() && (
                <div className="mt-0.5 text-fine text-ink-soft break-words leading-relaxed">{body.trim()}</div>
              )}
              <div className="mt-1 text-cap text-ink-faint">just now</div>
            </div>
          </div>
        </div>

        {/* Recipient count — the number the send will reach. */}
        <div className="mt-4 flex items-center justify-between rounded-[10px] bg-paper hairline px-3.5 py-3">
          <span className="text-fine font-semibold text-ink-soft">Reaches</span>
          <span className="text-note font-extrabold tabular-nums">
            {countLoading ? (
              <span className="text-ink-faint">counting…</span>
            ) : count === null ? (
              <span className="text-ink-faint">—</span>
            ) : (
              <>
                {count}
                <span className="text-ink-faint font-semibold"> merchant{count === 1 ? "" : "s"}</span>
              </>
            )}
          </span>
        </div>

        <button
          type="button"
          disabled={!canSend}
          onClick={() => setConfirming(true)}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="bolt" className="w-4 h-4" strokeWidth={2} />
          {sending ? "Sending…" : "Send broadcast"}
        </button>
        {count === 0 && !countLoading && (
          <p className="mt-2 text-fine text-ink-faint text-center">No merchants match this audience.</p>
        )}
      </aside>

      {confirming && (
        <ConfirmDialog
          title="Send this broadcast?"
          message={`${count ?? 0} merchant${count === 1 ? "" : "s"} will see “${title.trim()}” in their notification bell. This can't be unsent.`}
          confirmLabel="Send to all"
          icon="bolt"
          onCancel={() => setConfirming(false)}
          onConfirm={() => void doSend()}
        />
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</span>
        {hint && <span className="text-cap text-ink-faint tabular-nums">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
