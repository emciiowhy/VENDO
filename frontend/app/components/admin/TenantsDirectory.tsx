"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatDate, formatPeso } from "@/lib/format";
import { impersonateTenant } from "@/lib/auth";
import {
  getTenants,
  updateTenant,
  resetOwnerPassword,
  resendOnboarding,
  getOpenShifts,
  forceCloseShift,
  getTimeline,
  createNote,
  updateNote,
  deleteNote,
  type Plan,
  type Tenant,
  type TenantStatus,
  type OpenShift,
  type TimelineEntry,
} from "@/lib/adminTenants";
import { PLAN_LABEL, PLAN_PRICE } from "./tenants.data";

/**
 * The Tenants Directory — every provisioned subscriber, live from the platform
 * database, manageable in one place. Approving a lead creates a tenant + owner
 * row, and it shows up here immediately (no mock data). "Manage" opens the
 * control panel with the three real levers an admin pulls to support a business
 * owner: open their owner dashboard (impersonation), change their plan tier, and
 * suspend / reinstate their workspace. Each write hits a SUPER_ADMIN-only
 * endpoint and the row updates in place.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: Tenant[] };

const STATUS_FILTERS: ("all" | TenantStatus)[] = ["all", "active", "suspended"];
const STATUS_FILTER_LABEL: Record<"all" | TenantStatus, string> = {
  all: "All status",
  active: "Active",
  suspended: "Suspended",
};

/** Plan price is the tenant's MRR contribution (whole pesos for the headline). */
const mrrPeso = (plan: Plan) => formatPeso(PLAN_PRICE[plan]);

export function TenantsDirectory() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TenantStatus>("all");
  const [active, setActive] = useState<Tenant | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getTenants();
      if (!alive) return;
      if (res.ok) {
        setState({ status: "ready", rows: res.tenants });
        // Deep-link from the Overview watchlist: `?manage=<id>` opens that store's
        // Manage panel straight away. Read from the URL (not useSearchParams) so the
        // auth-walled client page needs no Suspense boundary; the param is then
        // stripped so a refresh or back-nav doesn't re-open the modal.
        const manageId = new URLSearchParams(window.location.search).get("manage");
        if (manageId) {
          const target = res.tenants.find((t) => t.id === manageId);
          if (target) setActive(target);
          window.history.replaceState(null, "", "/admin/tenants");
        }
      } else {
        setState({ status: "error", message: res.error ?? "Could not load tenants." });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  /** Replace a tenant row after a successful write, keeping the modal in sync. */
  function applyUpdate(updated: Tenant) {
    setState((prev) =>
      prev.status === "ready"
        ? { status: "ready", rows: prev.rows.map((t) => (t.id === updated.id ? updated : t)) }
        : prev,
    );
    setActive((cur) => (cur && cur.id === updated.id ? updated : cur));
  }

  const totalRows = state.status === "ready" ? state.rows.length : 0;
  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const q = query.trim().toLowerCase();
    return state.rows.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.slug ?? "").toLowerCase().includes(q) ||
        (t.ownerName ?? "").toLowerCase().includes(q) ||
        (t.ownerEmail ?? "").toLowerCase().includes(q)
      );
    });
  }, [state, query, statusFilter]);

  return (
    <section className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      {/* Panel header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 sm:px-6 py-4 hairline-b">
        <div>
          <h2 className="text-[1.05rem] font-extrabold tracking-tight">Tenants Directory</h2>
          <p className="text-[12.5px] text-ink-soft">
            {state.status === "ready"
              ? `${filtered.length} of ${totalRows} registered store environment${totalRows === 1 ? "" : "s"}`
              : "Loading store environments…"}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="relative">
            <Icon name="search" className="w-[16px] h-[16px] text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tenants…"
              className="field-input rounded-[10px] pl-9 pr-3 py-2 text-[13.5px] w-[180px] sm:w-[220px]"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="field-input rounded-[10px] px-3 py-2 text-[13.5px] font-semibold"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATUS_FILTER_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
              <th className="px-6 py-3 font-bold">Tenant</th>
              <th className="px-4 py-3 font-bold">Owner</th>
              <th className="px-4 py-3 font-bold">Plan</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-right">MRR</th>
              <th className="px-4 py-3 font-bold">Onboarded</th>
              <th className="px-4 py-3 font-bold text-right">Manage</th>
            </tr>
          </thead>
          <tbody>
            {state.status === "loading" &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="hairline-b last:border-0">
                  <td colSpan={7} className="px-6 py-3.5">
                    <div className="h-9 rounded-[10px] bg-paper hairline animate-pulse" />
                  </td>
                </tr>
              ))}

            {state.status === "error" && (
              <tr>
                <td colSpan={7} className="px-6 py-14 text-center text-rose-600 text-[14px] font-semibold">
                  {state.message}
                </td>
              </tr>
            )}

            {state.status === "ready" &&
              filtered.map((t) => (
                <tr key={t.id} className="hairline-b last:border-0 hover:bg-paper/70 transition duration-150">
                  <td className="px-6 py-3.5">
                    <div className="font-bold tracking-tight">{t.name}</div>
                    <div className="text-[12px] text-ink-faint font-mono">{t.slug ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-[13px] font-semibold truncate max-w-[180px]">{t.ownerName ?? "—"}</div>
                    <div className="text-[12px] text-ink-faint truncate max-w-[180px]">
                      {t.ownerEmail ?? "No owner contact"}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <PlanBadge plan={t.plan} />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold tracking-tight tabular-nums">
                    {mrrPeso(t.plan)}
                    <span className="text-ink-faint font-semibold text-[12px]">/mo</span>
                  </td>
                  <td className="px-4 py-3.5 text-[13px] text-ink-soft whitespace-nowrap">
                    {formatDate(t.createdAt)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => setActive(t)}
                      className="inline-flex items-center gap-1.5 bg-surface hairline rounded-[10px] px-3 py-1.5 text-[13px] font-semibold hover:border-brand-200 hover:text-brand-600 transition duration-150"
                    >
                      <Icon name="gear" className="w-[15px] h-[15px]" />
                      Manage
                    </button>
                  </td>
                </tr>
              ))}

            {state.status === "ready" && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-14 text-center text-ink-soft text-[14px]">
                  {totalRows === 0 ? "No subscribers yet." : "No tenants match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {active && (
        <TenantManageModal
          tenant={active}
          onClose={() => setActive(null)}
          onUpdated={applyUpdate}
          toast={showToast}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[130] flex items-center gap-2.5 rounded-[12px] bg-ink dark:bg-[#0b1220] text-white px-4 py-3 shadow-soft text-[13.5px] font-semibold max-w-[360px]">
          <span className="grid place-items-center w-6 h-6 rounded-full bg-accent-500 shrink-0">
            <Icon name="check" className="w-4 h-4 text-white" strokeWidth={2.4} />
          </span>
          {toast}
        </div>
      )}
    </section>
  );
}

/* ----------------------------- badges & bits ----------------------------- */

export function PlanBadge({ plan }: { plan: Plan }) {
  const styles: Record<Plan, string> = {
    starter: "bg-paper text-ink-soft hairline",
    business: "bg-brand-50 text-brand-700",
    enterprise: "bg-ink dark:bg-[#0b1220] text-white",
  };
  return (
    <span className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-tight " + styles[plan]}>
      {PLAN_LABEL[plan]}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-tight " +
        (active ? "bg-accent-50 text-accent-600" : "bg-rose-50 text-rose-600")
      }
    >
      <span className={"w-1.5 h-1.5 rounded-full " + (active ? "bg-accent-500" : "bg-rose-500")} />
      {active ? "Active" : "Suspended"}
    </span>
  );
}

/* ------------------------------ manage modal ------------------------------ */

type View =
  | { kind: "menu" }
  | { kind: "editPlan" }
  | { kind: "confirmStatus"; next: TenantStatus }
  | { kind: "credentials" } // A1 — reset owner password / resend onboarding
  | { kind: "shifts" } // A3 — force-close a stuck cashier shift
  | { kind: "timeline" }; // A2 — per-tenant support timeline

function TenantManageModal({
  tenant,
  onClose,
  onUpdated,
  toast,
}: {
  tenant: Tenant;
  onClose: () => void;
  onUpdated: (t: Tenant) => void;
  toast: (msg: string) => void;
}) {
  const [view, setView] = useState<View>({ kind: "menu" });
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState<Plan>(tenant.plan);

  const suspended = tenant.status === "suspended";

  // Open the merchant's own dashboard by minting a session as their owner. A
  // full navigation is required so the swapped cookie + useSession cache reset
  // both take effect (see lib/auth.impersonateTenant).
  async function openOwnerDashboard() {
    setError(null);
    setOpening(true);
    const res = await impersonateTenant(tenant.id);
    if (res.ok) {
      window.location.assign(res.redirectTo);
      return;
    }
    setError(res.error);
    setOpening(false);
  }

  async function applyPlan() {
    if (newPlan === tenant.plan) return;
    setError(null);
    setBusy(true);
    const res = await updateTenant(tenant.id, { plan: newPlan });
    setBusy(false);
    if (res.ok) {
      onUpdated(res.tenant);
      toast(`${tenant.name} moved to ${PLAN_LABEL[newPlan]}.`);
      setView({ kind: "menu" });
    } else {
      setError(res.error ?? "Could not change the plan.");
    }
  }

  async function applyStatus(next: TenantStatus) {
    setError(null);
    setBusy(true);
    const res = await updateTenant(tenant.id, { status: next });
    setBusy(false);
    if (res.ok) {
      onUpdated(res.tenant);
      toast(next === "suspended" ? `${tenant.name} workspace suspended.` : `${tenant.name} reinstated.`);
      setView({ kind: "menu" });
    } else {
      setError(res.error ?? "Could not change the status.");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center px-5 py-8" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm overlay-backdrop" />
      <div className="relative w-full max-w-[560px] max-h-full overflow-y-auto rounded-xl2 bg-surface hairline shadow-soft overlay-card">
        {/* header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 hairline-b">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="building" className="w-5 h-5" strokeWidth={1.6} />
            </span>
            <div>
              <h3 className="text-[1.2rem] font-extrabold tracking-tightest leading-tight">{tenant.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
                <span className="font-mono text-ink-faint">{tenant.slug ?? "—"}</span>
                <PlanBadge plan={tenant.plan} />
                <StatusBadge status={tenant.status} />
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1 -mt-1 -mr-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-6 py-5">
          {error && (
            <p className="mb-4 text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
          )}

          {view.kind === "menu" && (
            <div className="space-y-5">
              <Group label="Support & Access">
                <ActionBtn
                  icon="eye"
                  label={opening ? "Opening…" : "Open Owner Dashboard"}
                  hint={tenant.ownerEmail ? "Sign in as the owner to help them set up" : "No owner provisioned yet"}
                  onClick={() => void openOwnerDashboard()}
                  disabled={opening || !tenant.ownerEmail}
                />
                <ActionBtn
                  icon="lock"
                  label="Recover Owner Access"
                  hint={tenant.ownerEmail ? "Reset password or re-send the sign-in email" : "No owner provisioned yet"}
                  onClick={() => setView({ kind: "credentials" })}
                  disabled={!tenant.ownerEmail}
                />
                <ActionBtn
                  icon="clock"
                  label="Force-Close a Shift"
                  hint="Z-Read a cashier's drawer left open"
                  onClick={() => setView({ kind: "shifts" })}
                />
                <ActionBtn
                  icon="file"
                  label="Support Timeline"
                  hint="Notes & the audit trail for this store"
                  onClick={() => setView({ kind: "timeline" })}
                />
              </Group>

              <Group label="Provisioning & Tier">
                <ActionBtn
                  icon="tag"
                  label="Edit Plan"
                  hint="Change tier — re-caps product capacity & MRR"
                  onClick={() => {
                    setNewPlan(tenant.plan);
                    setView({ kind: "editPlan" });
                  }}
                />
              </Group>

              <Group label="Workspace Status">
                {suspended ? (
                  <ActionBtn
                    icon="refresh"
                    label="Reinstate Workspace"
                    hint="Set status to ACTIVE — owner can sign in again"
                    onClick={() => setView({ kind: "confirmStatus", next: "active" })}
                  />
                ) : (
                  <ActionBtn
                    icon="ban"
                    label="Suspend Workspace"
                    hint="Set status to SUSPENDED — blocks all sign-in"
                    danger
                    onClick={() => setView({ kind: "confirmStatus", next: "suspended" })}
                  />
                )}
              </Group>
            </div>
          )}

          {view.kind === "editPlan" && (
            <Panel title="Edit Plan & Tier" icon="tag" onBack={() => setView({ kind: "menu" })}>
              <p className="text-[13.5px] text-ink-soft leading-relaxed">
                Change the subscription tier. The product capacity cap and the tenant&apos;s MRR adjust to
                the new plan immediately.
              </p>
              <div className="mt-4 space-y-2.5">
                {(["starter", "business", "enterprise"] as Plan[]).map((p) => (
                  <label
                    key={p}
                    className={
                      "flex items-center gap-3 rounded-[12px] px-4 py-3 cursor-pointer transition duration-150 " +
                      (newPlan === p ? "bg-brand-50 ring-2 ring-brand-200" : "hairline hover:bg-paper")
                    }
                  >
                    <input type="radio" name="plan" checked={newPlan === p} onChange={() => setNewPlan(p)} className="accent-brand-500" />
                    <span className="flex-1">
                      <span className="font-bold tracking-tight">{PLAN_LABEL[p]}</span>
                      {tenant.plan === p && <span className="ml-2 text-[11px] font-bold text-ink-faint">current</span>}
                    </span>
                    <span className="font-bold tracking-tight tabular-nums">
                      {formatPeso(PLAN_PRICE[p])}
                      <span className="text-ink-faint font-semibold text-[12px]">/mo</span>
                    </span>
                  </label>
                ))}
              </div>
              <PrimaryBtn busy={busy} disabled={newPlan === tenant.plan} onClick={() => void applyPlan()}>
                Apply plan change
              </PrimaryBtn>
            </Panel>
          )}

          {view.kind === "confirmStatus" && (
            <Panel
              title={view.next === "suspended" ? "Suspend Workspace" : "Reinstate Workspace"}
              icon={view.next === "suspended" ? "ban" : "refresh"}
              onBack={() => setView({ kind: "menu" })}
            >
              <div
                className={
                  "mt-2 rounded-[12px] px-4 py-3.5 text-[13.5px] leading-relaxed " +
                  (view.next === "suspended" ? "bg-rose-50 text-rose-700" : "bg-paper text-ink-soft")
                }
              >
                {view.next === "suspended"
                  ? `Flip ${tenant.name} to SUSPENDED. The owner and their staff can no longer sign in until reinstated — existing sessions stop resolving on their next check.`
                  : `Set ${tenant.name} back to ACTIVE. The owner and staff can sign in again immediately.`}
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setView({ kind: "menu" })}
                  className="flex-1 rounded-[10px] hairline bg-surface py-3 font-semibold text-[14px] text-ink-soft hover:text-ink transition duration-150"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void applyStatus(view.next)}
                  disabled={busy}
                  className={
                    "flex-1 rounded-[10px] py-3 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-60 " +
                    (view.next === "suspended" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-500 hover:bg-brand-600")
                  }
                >
                  {busy ? "Working…" : view.next === "suspended" ? "Suspend workspace" : "Reinstate workspace"}
                </button>
              </div>
            </Panel>
          )}

          {view.kind === "credentials" && (
            <Panel title="Recover Owner Access" icon="lock" onBack={() => setView({ kind: "menu" })}>
              <CredentialsPanel tenant={tenant} toast={toast} />
            </Panel>
          )}

          {view.kind === "shifts" && (
            <Panel title="Force-Close a Shift" icon="clock" onBack={() => setView({ kind: "menu" })}>
              <ShiftsPanel tenantId={tenant.id} toast={toast} />
            </Panel>
          )}

          {view.kind === "timeline" && (
            <Panel title="Support Timeline" icon="file" onBack={() => setView({ kind: "menu" })}>
              <TimelinePanel tenantId={tenant.id} toast={toast} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="pb-2 text-[11px] font-bold tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  hint,
  onClick,
  danger,
  disabled,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "group flex w-full items-center gap-3 rounded-[12px] hairline px-4 py-3 text-left transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed " +
        (danger ? "hover:border-rose-200 hover:bg-rose-50" : "hover:border-brand-200 hover:bg-paper")
      }
    >
      <span
        className={
          "grid place-items-center w-9 h-9 rounded-[10px] shrink-0 transition duration-150 " +
          (danger ? "bg-rose-50 text-rose-600" : "bg-paper text-ink-soft group-hover:bg-brand-50 group-hover:text-brand-600")
        }
      >
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.5} />
      </span>
      <span className="min-w-0">
        <span className={"block font-bold tracking-tight " + (danger ? "text-rose-700" : "")}>{label}</span>
        <span className="block text-[12px] text-ink-faint">{hint}</span>
      </span>
      <Icon name="chevron" className="ml-auto w-4 h-4 -rotate-90 text-ink-faint shrink-0" />
    </button>
  );
}

function Panel({
  title,
  icon,
  onBack,
  children,
}: {
  title: string;
  icon: IconName;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink transition"
      >
        <Icon name="chevron" className="w-4 h-4 rotate-90" />
        Back
      </button>
      <div className="flex items-center gap-2.5 mb-1">
        <Icon name={icon} className="w-5 h-5 text-brand-600" strokeWidth={1.6} />
        <h4 className="text-[1.05rem] font-extrabold tracking-tight">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function PrimaryBtn({
  children,
  onClick,
  busy,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="mt-5 w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {busy ? "Working…" : children}
    </button>
  );
}

/* --------------------------- A1: credential recovery ----------------------- */

function CredentialsPanel({ tenant, toast }: { tenant: Tenant; toast: (msg: string) => void }) {
  const [busy, setBusy] = useState<null | "reset" | "resend">(null);
  const [error, setError] = useState<string | null>(null);
  // The one-time temp password, held only in this closed panel's memory.
  const [temp, setTemp] = useState<{ password: string; email: string; mailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function reset() {
    setBusy("reset");
    setError(null);
    const res = await resetOwnerPassword(tenant.id);
    setBusy(null);
    if (res.ok) {
      setTemp({ password: res.tempPassword, email: res.ownerEmail, mailed: res.mailDelivered });
    } else {
      setError(res.error ?? "Could not reset the password.");
    }
  }

  async function resend() {
    setBusy("resend");
    setError(null);
    const res = await resendOnboarding(tenant.id);
    setBusy(null);
    if (res.ok) {
      toast(
        res.mailDelivered
          ? `Onboarding email re-sent to ${res.ownerEmail}.`
          : `Re-send attempted, but delivery failed — check the Resend config or server logs.`,
      );
    } else {
      setError(res.error ?? "Could not re-send the onboarding email.");
    }
  }

  async function copy() {
    if (!temp) return;
    try {
      await navigator.clipboard.writeText(temp.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the password is visible to read out anyway */
    }
  }

  return (
    <div className="mt-2 space-y-4">
      {!temp ? (
        <>
          <p className="text-[13.5px] text-ink-soft leading-relaxed">
            Help an owner who can&apos;t sign in. Resetting generates a one-time temporary password
            (shown once here and emailed to them); re-sending re-delivers their original sign-in steps.
          </p>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => void reset()}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-[12px] hairline px-4 py-3 text-left hover:bg-paper transition duration-150 disabled:opacity-50"
            >
              <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-paper text-ink-soft shrink-0">
                <Icon name="lock" className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold tracking-tight">
                  {busy === "reset" ? "Resetting…" : "Reset owner password"}
                </span>
                <span className="block text-[12px] text-ink-faint">Mint a temporary password for {tenant.ownerEmail}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void resend()}
              disabled={busy !== null}
              className="flex w-full items-center gap-3 rounded-[12px] hairline px-4 py-3 text-left hover:bg-paper transition duration-150 disabled:opacity-50"
            >
              <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-paper text-ink-soft shrink-0">
                <Icon name="refresh" className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold tracking-tight">
                  {busy === "resend" ? "Sending…" : "Re-send onboarding email"}
                </span>
                <span className="block text-[12px] text-ink-faint">Re-deliver the welcome / sign-in steps</span>
              </span>
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="rounded-[12px] bg-brand-50 ring-2 ring-brand-200 px-4 py-3.5">
            <div className="text-[11px] font-bold tracking-wide text-brand-700 uppercase">Temporary password</div>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 font-mono text-[15px] font-bold tracking-tight text-ink break-all">
                {temp.password}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                className="shrink-0 rounded-[8px] bg-surface hairline px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:text-ink transition"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <p className="text-[13px] text-ink-soft leading-relaxed">
            Shown once — read it to the owner now. {temp.mailed
              ? `It was also emailed to ${temp.email}.`
              : `Email delivery to ${temp.email} failed, so share it directly.`}{" "}
            They should change it from Account → Security after signing in.
          </p>
        </div>
      )}
      {error && (
        <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
      )}
    </div>
  );
}

/* --------------------------- A3: force-close shifts ------------------------ */

function ShiftsPanel({ tenantId, toast }: { tenantId: string; toast: (msg: string) => void }) {
  const [shifts, setShifts] = useState<OpenShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  async function load() {
    const res = await getOpenShifts(tenantId);
    if (res.ok) setShifts(res.shifts);
    else setError(res.error ?? "Could not load open shifts.");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function close(shift: OpenShift) {
    setClosingId(shift.cashierUserId);
    setError(null);
    const res = await forceCloseShift(tenantId, shift.cashierUserId);
    setClosingId(null);
    if (res.ok) {
      toast(`Force-closed ${shift.cashierName}'s shift.`);
      setShifts((prev) => (prev ?? []).filter((s) => s.cashierUserId !== shift.cashierUserId));
    } else {
      setError(res.error ?? "Could not force-close the shift.");
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <p className="text-[13.5px] text-ink-soft leading-relaxed">
        Z-Read a drawer a cashier left open. The shift closes against its expected cash (no physical
        count — recorded as zero variance) and the Z-Read is stamped with your name.
      </p>
      {error && (
        <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
      )}
      {shifts === null ? (
        <p className="py-6 text-center text-[13px] text-ink-soft">Loading open shifts…</p>
      ) : shifts.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-soft">No open shifts — every drawer is reconciled.</p>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => (
            <div key={s.cashierUserId} className="flex items-center gap-3 rounded-[12px] hairline px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-bold tracking-tight truncate">{s.cashierName}</div>
                <div className="text-[12px] text-ink-faint">
                  Opened {formatDate(s.openedAt)} · {formatPeso(s.salesCents / 100)} sales
                </div>
              </div>
              <button
                type="button"
                onClick={() => void close(s)}
                disabled={closingId !== null}
                className="shrink-0 rounded-[9px] bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-[13px] font-semibold text-white shadow-btn transition disabled:opacity-60"
              >
                {closingId === s.cashierUserId ? "Closing…" : "Force close"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- A2: support timeline -------------------------- */

const AUDIT_LABEL: Record<string, string> = {
  tenant_plan_change: "Plan changed",
  tenant_status_change: "Status changed",
  broadcast: "Broadcast sent",
  profile_update: "Admin profile updated",
  owner_password_reset: "Owner password reset",
  onboarding_resend: "Onboarding email re-sent",
  shift_force_close: "Shift force-closed",
  lead_edit: "Lead edited",
  lead_delete: "Lead deleted",
};

function TimelinePanel({ tenantId, toast }: { tenantId: string; toast: (msg: string) => void }) {
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  async function load() {
    const res = await getTimeline(tenantId);
    if (res.ok) setTimeline(res.timeline);
    else setError(res.error ?? "Could not load the timeline.");
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function add() {
    const text = body.trim();
    if (!text) return;
    setSaving(true);
    setError(null);
    const res = await createNote(tenantId, text);
    setSaving(false);
    if (res.ok) {
      setBody("");
      void load();
    } else {
      setError(res.error ?? "Could not save the note.");
    }
  }

  async function saveEdit(noteId: string) {
    const text = editBody.trim();
    if (!text) return;
    const res = await updateNote(tenantId, noteId, text);
    if (res.ok) {
      setEditingId(null);
      void load();
    } else {
      setError(res.error ?? "Could not update the note.");
    }
  }

  async function remove(noteId: string) {
    const res = await deleteNote(tenantId, noteId);
    if (res.ok) {
      toast("Note deleted.");
      setTimeline((prev) => (prev ?? []).filter((e) => !(e.kind === "note" && e.id === noteId)));
    } else {
      setError(res.error ?? "Could not delete the note.");
    }
  }

  return (
    <div className="mt-2 space-y-4">
      {/* Add note */}
      <div className="rounded-[12px] hairline bg-paper px-3.5 py-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a support note — a call summary, a follow-up, context for the next operator…"
          className="field-input w-full rounded-[10px] px-3 py-2 text-[13.5px] text-ink resize-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => void add()}
            disabled={saving || !body.trim()}
            className="rounded-[9px] bg-brand-500 hover:bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-btn transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
      )}

      {/* Timeline */}
      {timeline === null ? (
        <p className="py-6 text-center text-[13px] text-ink-soft">Loading the timeline…</p>
      ) : timeline.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-soft">Nothing recorded yet — add the first note.</p>
      ) : (
        <ol className="space-y-3">
          {timeline.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex gap-3">
              <span
                className={
                  "mt-1 grid place-items-center w-7 h-7 rounded-full shrink-0 " +
                  (e.kind === "note" ? "bg-brand-50 text-brand-600" : "bg-paper text-ink-faint")
                }
              >
                <Icon name={e.kind === "note" ? "file" : "activity"} className="w-3.5 h-3.5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                {e.kind === "note" && editingId === e.id ? (
                  <div className="rounded-[10px] hairline bg-paper px-3 py-2.5">
                    <textarea
                      value={editBody}
                      onChange={(ev) => setEditBody(ev.target.value)}
                      rows={2}
                      className="field-input w-full rounded-[8px] px-2.5 py-1.5 text-[13px] text-ink resize-none"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-[8px] px-2.5 py-1 text-[12px] font-semibold text-ink-soft hover:text-ink transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(e.id)}
                        disabled={!editBody.trim()}
                        className="rounded-[8px] bg-brand-500 hover:bg-brand-600 px-2.5 py-1 text-[12px] font-semibold text-white transition disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-bold tracking-tight">
                        {e.kind === "note" ? e.authorName : AUDIT_LABEL[e.action] ?? e.action}
                      </span>
                      <span className="text-[11.5px] text-ink-faint shrink-0">{formatDate(e.at)}</span>
                    </div>
                    <p className="text-[13px] text-ink-soft leading-relaxed break-words">
                      {e.kind === "note" ? e.body : e.detail ?? `by ${e.authorName}`}
                      {e.kind === "note" && e.edited && (
                        <span className="ml-1 text-[11px] text-ink-faint">(edited)</span>
                      )}
                    </p>
                    {e.kind === "note" && (
                      <div className="mt-1 flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(e.id);
                            setEditBody(e.body);
                          }}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-ink transition"
                        >
                          <Icon name="pencil" className="w-3 h-3" strokeWidth={1.8} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(e.id)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-faint hover:text-rose-600 transition"
                        >
                          <Icon name="trash" className="w-3 h-3" strokeWidth={1.8} /> Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
