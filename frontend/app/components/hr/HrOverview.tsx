"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import {
  adoptCashier,
  getHrOverview,
  listEmployees,
  listUnlinkedCashiers,
  type Employee,
  type HrOverview as Overview,
  type UnlinkedCashier,
} from "@/lib/hr";

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

      <UnlinkedTillLogins />
    </div>
  );
}

/**
 * Cashier logins that exist without an HR employee record (ADR 0002). Lets the
 * owner ADOPT each one — create a fresh employee from it, or link it to an
 * existing unlinked employee. Renders nothing when there are no orphans.
 */
function UnlinkedTillLogins() {
  const { push } = useToast();
  const [cashiers, setCashiers] = useState<UnlinkedCashier[] | null>(null);
  const [adopting, setAdopting] = useState<UnlinkedCashier | null>(null);

  const load = useCallback(async () => {
    const res = await listUnlinkedCashiers();
    setCashiers(res.ok ? res.cashiers : []);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listUnlinkedCashiers();
      if (!alive) return;
      setCashiers(res.ok ? res.cashiers : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!cashiers || cashiers.length === 0) return null;

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden ring-1 ring-amber-200 dark:ring-amber-500/30">
      <div className="flex items-center justify-between px-5 py-4 hairline-b bg-amber-50/60 dark:bg-amber-500/10">
        <div>
          <h3 className="font-extrabold tracking-tight flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <Icon name="lock" className="w-[18px] h-[18px]" strokeWidth={1.9} />
            Unlinked till logins
          </h3>
          <p className="text-[12.5px] text-ink-soft mt-0.5">
            Cashier logins with no employee record. Adopt them into HR to track pay &amp; attendance.
          </p>
        </div>
        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 rounded-full px-2.5 py-0.5">
          {cashiers.length}
        </span>
      </div>
      <ul className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
        {cashiers.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-ink dark:bg-[#0b1220] text-white font-bold text-[13px] shrink-0">
              {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "—"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold tracking-tight truncate">{c.name}</div>
              <div className="text-[11.5px] text-ink-faint">{c.hasPin ? "PIN set" : "No PIN yet"}</div>
            </div>
            <button
              type="button"
              onClick={() => setAdopting(c)}
              className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[13px] px-3.5 py-2 rounded-[10px] shadow-btn transition duration-150"
            >
              <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
              Adopt
            </button>
          </li>
        ))}
      </ul>

      {adopting && (
        <AdoptModal
          cashier={adopting}
          onClose={() => setAdopting(null)}
          onDone={(name) => {
            setAdopting(null);
            push({ variant: "success", title: `Adopted ${name}`, message: "Now an employee in HR." });
            void load();
          }}
        />
      )}
    </div>
  );
}

function AdoptModal({
  cashier,
  onClose,
  onDone,
}: {
  cashier: UnlinkedCashier;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "link">("create");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listEmployees();
      if (!alive) return;
      // Only active employees without a till login can be linked.
      setEmployees(res.ok ? res.employees.filter((e) => e.isActive && e.userId === null) : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit() {
    setError(null);
    if (mode === "link" && !employeeId) return setError("Choose an employee to link.");
    setBusy(true);
    const res = await adoptCashier(
      cashier.id,
      mode === "create" ? { mode: "create" } : { mode: "link", employeeId },
    );
    setBusy(false);
    if (res.ok) return onDone(res.employee.name);
    setError(res.error ?? "Could not adopt the cashier.");
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Adopt cashier">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[400px] rounded-xl2 bg-surface hairline shadow-soft p-6">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink-faint hover:text-ink p-1">
          <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
        </button>
        <h3 className="text-[1.1rem] font-extrabold tracking-tight">Adopt {cashier.name}</h3>
        <p className="mt-0.5 text-[13px] text-ink-soft">Bring this till login into HR.</p>

        <div className="mt-4 grid grid-cols-2 gap-1.5 p-1 rounded-[11px] bg-paper hairline">
          {(["create", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={
                "py-2 rounded-[8px] text-[13px] font-semibold transition " +
                (mode === m ? "bg-surface shadow-card text-ink" : "text-ink-soft hover:text-ink")
              }
            >
              {m === "create" ? "New employee" : "Link existing"}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {mode === "create" ? (
            <p className="text-[13px] text-ink-soft">
              Creates a new employee named <span className="font-semibold text-ink">{cashier.name}</span>. You
              can fill in position, pay and the rest from their profile afterward.
            </p>
          ) : employees === null ? (
            <p className="text-[13px] text-ink-soft py-2 text-center">Loading employees…</p>
          ) : employees.length === 0 ? (
            <p className="text-[13px] text-ink-soft">No unlinked employees. Create a new one instead.</p>
          ) : (
            <label className="block">
              <span className="text-[12px] font-semibold text-ink-soft">Link to an existing employee</span>
              <select
                value={employeeId}
                onChange={(ev) => setEmployeeId(ev.target.value)}
                className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
              >
                <option value="">Choose an employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.position ? ` · ${e.position}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {error && <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>}
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || (mode === "link" && !employeeId)}
          className="mt-5 w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Adopting…" : "Adopt into HR"}
        </button>
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
