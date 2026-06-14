"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { getHrOverview, type HrOverview as Overview } from "@/lib/hr";

/**
 * HR executive overview hub — the manager's at-a-glance read on the workforce:
 * retention, headcount movement, and department / employment composition.
 * Who is currently on the clock lives in the POS view, not here, so it isn't
 * duplicated. Self-loading and tenant-scoped server-side.
 */
export function HrOverview() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Overview }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getHrOverview();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", data: res.overview });
      else setState({ status: "error", message: res.error ?? "Could not load the overview." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="grid gap-4 lg:grid-cols-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[220px]" />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
        <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
      </div>
    );
  }

  const o = state.data;
  const retentionTone = o.retentionRatePct >= 90 ? "good" : o.retentionRatePct >= 75 ? "warn" : "bad";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Retention */}
        <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-soft">Retention (30-day)</span>
            <Icon name="trend" className="w-[18px] h-[18px] text-ink-faint" strokeWidth={1.7} />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span
              className={
                "text-[2.4rem] leading-none font-extrabold tracking-tightest " +
                (retentionTone === "good" ? "text-accent-600" : retentionTone === "warn" ? "text-amber-600" : "text-rose-600")
              }
            >
              {o.retentionRatePct}%
            </span>
          </div>
          <Bar pct={o.retentionRatePct} tone={retentionTone} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
            <Movement icon="plus" label="New hires (mo)" value={o.newHiresThisMonth} tone="good" />
            <Movement icon="logout" label="Separations (mo)" value={o.separationsThisMonth} tone="bad" />
          </div>
        </div>

        {/* Department composition */}
        <Composition title="Departments" icon="grid" items={o.departments.map((d) => ({ label: d.name, count: d.count }))} total={o.activeHeadcount} />

        {/* Employment + pay mix */}
        <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink-soft">Workforce mix</span>
            <Icon name="users" className="w-[18px] h-[18px] text-ink-faint" strokeWidth={1.7} />
          </div>
          <div className="mt-3 space-y-3">
            <ChipRow heading="Employment" items={o.employmentTypes.map((t) => ({ label: t.type, count: t.count }))} />
            <ChipRow heading="Pay basis" items={o.payTypes.map((t) => ({ label: t.type, count: t.count }))} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Composition({ title, icon, items, total }: { title: string; icon: IconName; items: { label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-ink-soft">{title}</span>
        <Icon name={icon} className="w-[18px] h-[18px] text-ink-faint" strokeWidth={1.7} />
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink-soft">No active staff yet.</p>
      ) : (
        <div className="mt-3.5 space-y-2.5">
          {items.slice(0, 5).map((it) => (
            <div key={it.label}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold truncate pr-2">{it.label}</span>
                <span className="text-ink-faint tabular-nums">
                  {it.count} · {total > 0 ? Math.round((it.count / total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper overflow-hidden">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${(it.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChipRow({ heading, items }: { heading: string; items: { label: string; count: number }[] }) {
  return (
    <div>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{heading}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-[12.5px] text-ink-soft">—</span>}
        {items.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-1 bg-paper hairline">
            {it.label}
            <span className="text-ink-faint tabular-nums">{it.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Movement({ icon, label, value, tone }: { icon: IconName; label: string; value: number; tone: "good" | "bad" }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-paper px-2.5 py-2">
      <span className={"grid place-items-center w-6 h-6 rounded-[7px] " + (tone === "good" ? "bg-accent-50 text-accent-600" : "bg-rose-50 text-rose-600")}>
        <Icon name={icon} className="w-3.5 h-3.5" strokeWidth={2} />
      </span>
      <span className="text-ink-soft">{label}</span>
      <span className="ml-auto font-bold tabular-nums">{value}</span>
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone: "good" | "warn" | "bad" }) {
  return (
    <div className="mt-2 h-2 rounded-full bg-paper overflow-hidden">
      <div
        className={"h-full rounded-full " + (tone === "good" ? "bg-accent-500" : tone === "warn" ? "bg-amber-500" : "bg-rose-500")}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
