"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { formatDate } from "@/lib/format";
import { PLAN_LABEL, PLAN_PRICE, type Plan } from "./tenants.data";
import {
  approveLead,
  listLeads,
  rejectLead,
  slugify,
  type Lead,
  type LeadStatus,
} from "@/lib/adminLeads";

/**
 * Leads Management & Tenant Provisioning Matrix.
 *
 * The pipeline view mirrors the Tenants Directory table; "Review Request" opens
 * a right-anchored provisioning slide-over that auto-generates a URL-safe Store
 * ID from the business name and runs the atomic lead → tenant promotion.
 */
const STATUS_META: Record<LeadStatus, { label: string; badge: string; dot: string }> = {
  PENDING_DEMO: { label: "Pending demo", badge: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  APPROVED: { label: "Approved", badge: "bg-accent-50 text-accent-600", dot: "bg-accent-500" },
  REJECTED: { label: "Rejected", badge: "bg-rose-50 text-rose-600", dot: "bg-rose-500" },
};

export function LeadsMatrix() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeadStatus>("all");
  const [active, setActive] = useState<Lead | null>(null);
  // `success` is the normal green confirmation; `warning` (amber) flags a store
  // that provisioned fine but whose onboarding email didn't go out.
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "warning" } | null>(null);

  const flash = useCallback((msg: string, tone: "success" | "warning" = "success") => {
    setToast({ msg, tone });
    // Give the operator longer to read a warning than a routine confirmation.
    window.setTimeout(() => setToast(null), tone === "warning" ? 6000 : 3200);
  }, []);

  const reload = useCallback(async () => {
    const res = await listLeads();
    if (res.ok) setLeads(res.leads);
    else setLoadError(res.error ?? "Could not load the pipeline.");
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listLeads();
      if (!alive) return;
      if (res.ok) setLeads(res.leads);
      else setLoadError(res.error ?? "Could not load the pipeline.");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.businessName.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q)
      );
    });
  }, [leads, query, statusFilter]);

  const pending = useMemo(() => leads.filter((l) => l.status === "PENDING_DEMO").length, [leads]);
  const provisioned = useMemo(() => leads.filter((l) => l.status === "APPROVED").length, [leads]);

  /** Chips and the dropdown share one filter: clicking an active chip clears it. */
  const toggleStatus = useCallback((status: LeadStatus) => {
    setStatusFilter((cur) => (cur === status ? "all" : status));
  }, []);

  /** Reflect a status change locally and keep the open drawer in sync. */
  function patchLead(id: string, status: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
    setActive((cur) => (cur && cur.id === id ? { ...cur, status } : cur));
  }

  return (
    <section className="rounded-xl2 glass hairline shadow-soft overflow-hidden max-w-[1180px]">
      {/* Panel header */}
      <div className="flex flex-col gap-4 px-5 sm:px-6 py-4 hairline-b lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <h2 className="text-[1.05rem] font-extrabold tracking-tight">Demo Requests Pipeline</h2>
          {/* Pipeline metrics: interactive status chips wired to the filter. */}
          <div className="flex flex-wrap items-center gap-2">
            <PipelineChip
              label="Pending Requests"
              count={pending}
              tone="amber"
              active={statusFilter === "PENDING_DEMO"}
              onClick={() => toggleStatus("PENDING_DEMO")}
            />
            <PipelineChip
              label="Fully Provisioned"
              count={provisioned}
              tone="accent"
              active={statusFilter === "APPROVED"}
              onClick={() => toggleStatus("APPROVED")}
            />
            <PipelineChip
              label="Total Pipeline"
              count={leads.length}
              tone="brand"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="relative">
            <Icon
              name="search"
              className="w-[16px] h-[16px] text-ink-faint absolute left-3 top-1/2 -translate-y-1/2"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search leads…"
              className="field-input rounded-[10px] pl-9 pr-3 py-2 text-[13.5px] w-[180px] sm:w-[220px]"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="field-input rounded-[10px] px-3 py-2 text-[13.5px] font-semibold"
          >
            <option value="all">All status</option>
            <option value="PENDING_DEMO">Pending demo</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="text-[11px] font-bold tracking-wide text-ink-faint uppercase hairline-b">
              <th className="px-6 py-3 font-bold">Business / Contact</th>
              <th className="px-4 py-3 font-bold">Email</th>
              <th className="px-4 py-3 font-bold">Requested</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-14 text-center text-ink-soft text-[14px]">
                  Loading the pipeline…
                </td>
              </tr>
            )}
            {!loading && loadError && (
              <tr>
                <td colSpan={5} className="px-6 py-14 text-center text-rose-600 text-[14px] font-semibold">
                  {loadError}
                </td>
              </tr>
            )}
            {!loading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-14 text-center">
                  <div className="text-[14px] font-semibold text-ink">No leads here yet</div>
                  <div className="mt-1 text-[13px] text-ink-soft">
                    {leads.length === 0
                      ? "Demo requests from the landing page land here."
                      : "Try a different search or filter."}
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((l) => {
              // Approved/declined leads are settled transactions — dim their data
              // so the operator's eye lands on the rows that still need action.
              const settled = l.status !== "PENDING_DEMO";
              const tone = settled ? "opacity-60" : "";
              return (
                <tr
                  key={l.id}
                  className="hairline-b last:border-0 hover:bg-paper/70 transition-colors duration-150"
                >
                  <td className={"px-6 py-3.5 " + tone}>
                    <div className="font-bold tracking-tight">{l.businessName}</div>
                    <div className="text-[12px] text-ink-faint">
                      {l.contactName}
                      {l.businessType ? <> · {l.businessType}</> : null}
                    </div>
                  </td>
                  <td className={"px-4 py-3.5 text-[13px] text-ink-soft " + tone}>{l.email}</td>
                  <td className={"px-4 py-3.5 whitespace-nowrap " + tone}>
                    <div className="text-[13px] text-ink-soft">{formatDate(l.requestedAt)}</div>
                    <div className="text-[11.5px] text-ink-faint">{relativeTime(l.requestedAt)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <LeadStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex justify-end">
                      <LeadActionCell status={l.status} onProvision={() => setActive(l)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {active && (
        <ProvisionDrawer
          lead={active}
          onClose={() => setActive(null)}
          onApproved={(slug, ownerEmail, mailDelivered) => {
            patchLead(active.id, "APPROVED");
            const name = active.businessName;
            setActive(null);
            if (mailDelivered) {
              flash(`Provisioned “${name}” at /${slug} — onboarding email sent to ${ownerEmail}.`);
            } else {
              flash(
                `Provisioned “${name}” at /${slug}, but onboarding email delivery failed. Verify your Resend domain configuration or check server logs.`,
                "warning",
              );
            }
            void reload();
          }}
          onRejected={() => {
            patchLead(active.id, "REJECTED");
            setActive(null);
            flash(`Declined “${active.businessName}”.`);
          }}
        />
      )}

      {toast && (
        <div
          role={toast.tone === "warning" ? "alert" : "status"}
          className="fixed bottom-6 right-6 z-[130] flex items-center gap-2.5 rounded-[12px] bg-ink dark:bg-[#0b1220] text-white px-4 py-3 shadow-soft text-[13.5px] font-semibold max-w-[360px]"
        >
          <span
            className={
              "grid place-items-center w-6 h-6 rounded-full shrink-0 " +
              (toast.tone === "warning" ? "bg-amber-500" : "bg-accent-500")
            }
          >
            <Icon
              name={toast.tone === "warning" ? "ban" : "check"}
              className="w-4 h-4 text-white"
              strokeWidth={2.4}
            />
          </span>
          {toast.msg}
        </div>
      )}
    </section>
  );
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold tracking-tight " +
        m.badge
      }
    >
      <span className={"w-1.5 h-1.5 rounded-full " + m.dot} />
      {m.label}
    </span>
  );
}

type ChipTone = "amber" | "accent" | "brand";

const CHIP_TONE: Record<ChipTone, { dot: string; active: string }> = {
  amber: { dot: "bg-amber-500", active: "bg-amber-50 text-amber-600 ring-1 ring-amber-500/30" },
  accent: { dot: "bg-accent-500", active: "bg-accent-50 text-accent-600 ring-1 ring-accent-500/30" },
  brand: { dot: "bg-brand-500", active: "bg-brand-50 text-brand-700 ring-1 ring-brand-500/30" },
};

/**
 * A compact, toggleable pipeline counter. The figure leads (tight tracking,
 * tabular figures) with a quiet label beneath the eye; the active state lifts a
 * soft token wash so it reads as the currently-applied filter.
 */
function PipelineChip({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: ChipTone;
  active: boolean;
  onClick: () => void;
}) {
  const t = CHIP_TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-2 rounded-[10px] pl-2.5 pr-3 py-1.5 transition duration-150 " +
        (active
          ? t.active
          : "bg-paper hairline text-ink-soft hover:hairline-strong hover:text-ink")
      }
    >
      <span className={"w-1.5 h-1.5 rounded-full shrink-0 " + t.dot} />
      <span className="text-[15px] font-extrabold tracking-tightest tabular-nums leading-none">{count}</span>
      <span className="text-[12px] font-semibold tracking-tight whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * The Action cell differentiates by state: a pending lead gets a crisp primary
 * "Provision Tenant" button; a settled lead gets a read-only status badge with a
 * soft wash (provisioned = settled-money accent, declined = a quiet rose).
 */
function LeadActionCell({
  status,
  onProvision,
}: {
  status: LeadStatus;
  onProvision: () => void;
}) {
  if (status === "PENDING_DEMO") {
    return (
      <button
        type="button"
        onClick={onProvision}
        className="inline-flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-[10px] px-3 py-1.5 text-[13px] font-semibold shadow-btn transition duration-150"
      >
        <Icon name="bolt" className="w-[15px] h-[15px]" strokeWidth={1.8} />
        Provision Tenant
      </button>
    );
  }
  const provisioned = status === "APPROVED";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[12px] font-semibold " +
        (provisioned ? "bg-accent-50 text-accent-600" : "bg-rose-50 text-rose-600")
      }
    >
      <Icon name={provisioned ? "check" : "x"} className="w-[14px] h-[14px]" strokeWidth={2.2} />
      {provisioned ? "Provisioned" : "Declined"}
    </span>
  );
}

/** "8d ago" — how long a request has sat in the queue, from its timestamp. */
function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/* ----------------------------- provisioning drawer ----------------------------- */

const FIELD = "field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink";

function ProvisionDrawer({
  lead,
  onClose,
  onApproved,
  onRejected,
}: {
  lead: Lead;
  onClose: () => void;
  onApproved: (slug: string, ownerEmail: string, mailDelivered: boolean) => void;
  onRejected: () => void;
}) {
  const [storeName, setStoreName] = useState(lead.businessName);
  const [slug, setSlug] = useState(() => slugify(lead.businessName));
  const [slugTouched, setSlugTouched] = useState(false);
  const [plan, setPlan] = useState<Plan>("starter");
  const [ownerEmail, setOwnerEmail] = useState(lead.email);
  const [ownerName, setOwnerName] = useState(lead.contactName);
  // Optional. The owner may have set their own password on the demo request
  // (lead.hasOwnerPassword) — in which case this can stay blank and the operator
  // never has to issue a credential.
  const [ownerPassword, setOwnerPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /** Live slug generation from the store name until the admin edits it directly. */
  function onStoreName(value: string) {
    setStoreName(value);
    if (!slugTouched) setSlug(slugify(value));
  }
  function onSlug(value: string) {
    setSlugTouched(true);
    // keep it URL-safe as they type
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48));
  }

  async function approve() {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const res = await approveLead(lead.id, {
      storeName,
      slug,
      plan,
      ownerEmail,
      ownerName,
      ownerPassword: ownerPassword.trim() || undefined,
    });
    if (res.ok) {
      // Default to delivered when the field is absent (older API) so a successful
      // provision never shows a spurious mail-failure warning.
      onApproved(res.tenant.slug, res.onboardingEmailTo ?? ownerEmail, res.mailDelivered ?? true);
      return;
    }
    setBusy(false);
    if (res.errors) setFieldErrors(res.errors);
    if (res.field && res.error) setFieldErrors((p) => ({ ...p, [res.field as string]: res.error as string }));
    setError(res.error ?? (res.errors ? "Please fix the highlighted fields." : "Could not provision."));
  }

  async function decline() {
    setBusy(true);
    setError(null);
    const res = await rejectLead(lead.id);
    if (res.ok) {
      onRejected();
      return;
    }
    setBusy(false);
    setError(res.error ?? "Could not decline this lead.");
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Review demo request">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <aside className="slide-over absolute inset-y-0 right-0 w-full max-w-[440px] bg-surface hairline-l shadow-soft flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 hairline-b">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 shrink-0">
              <Icon name="store" className="w-5 h-5" strokeWidth={1.6} />
            </span>
            <div>
              <h3 className="text-[1.15rem] font-extrabold tracking-tightest leading-tight">
                Review &amp; Provision
              </h3>
              <p className="mt-0.5 text-[12.5px] text-ink-soft">Promote this lead into a live tenant</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1 -mt-1 -mr-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Lead summary */}
          <div className="rounded-[12px] bg-paper hairline px-4 py-3.5 space-y-1.5">
            <SummaryRow label="Requested by" value={lead.contactName} />
            <SummaryRow label="Email" value={lead.email} />
            <SummaryRow label="Phone" value={lead.phone} />
            {lead.businessType && <SummaryRow label="Business" value={lead.businessType} />}
            {lead.hasOwnerPassword && (
              <div className="flex items-center gap-2 pt-0.5 text-[12.5px] font-semibold text-accent-600">
                <Icon name="lock" className="w-3.5 h-3.5 shrink-0" strokeWidth={1.9} />
                Owner set their own password
              </div>
            )}
            {lead.message && (
              <p className="pt-1.5 text-[12.5px] text-ink-soft italic leading-relaxed">“{lead.message}”</p>
            )}
          </div>

          <Field label="Store name" error={fieldErrors.storeName}>
            <input value={storeName} onChange={(e) => onStoreName(e.target.value)} className={FIELD} />
          </Field>

          <Field
            label="Store ID (slug)"
            error={fieldErrors.slug}
            hint="Auto-generated from the store name — edit if needed."
          >
            <div className="relative">
              <input
                value={slug}
                onChange={(e) => onSlug(e.target.value)}
                placeholder="kape-ni-juan"
                className={FIELD + " pr-[112px] font-mono"}
                autoCapitalize="none"
                spellCheck={false}
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12.5px] font-medium text-ink-faint pointer-events-none">
                .vendopos.app
              </span>
            </div>
          </Field>

          {/* Plan selector */}
          <Field label="Plan tier" error={fieldErrors.plan}>
            <div className="relative">
              <select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} className={FIELD + " font-semibold appearance-none pr-9"}>
                {(["starter", "business", "enterprise"] as Plan[]).map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABEL[p]} — ₱{PLAN_PRICE[p].toLocaleString("en-PH")}/mo
                  </option>
                ))}
              </select>
              <Icon name="chevron" className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-4">
            <Field label="Owner name" error={fieldErrors.ownerName}>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={FIELD} />
            </Field>
            <Field label="Owner email" error={fieldErrors.ownerEmail} hint="The email they'll sign in with (Google, or Store ID + email + password).">
              <input
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className={FIELD}
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            <Field
              label="Owner password (optional)"
              error={fieldErrors.ownerPassword}
              hint={
                lead.hasOwnerPassword
                  ? "This owner set their own password with the request. Leave blank to keep it, or type a new one to override."
                  : "Optional — set a password so they can sign in with Store ID + email. Leave blank for Google-only sign-in."
              }
            >
              <input
                type="password"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                className={FIELD}
                placeholder={lead.hasOwnerPassword ? "•••••••• (set by owner)" : "Leave blank or set a password"}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>

          {error && (
            <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 hairline-t">
          <button
            type="button"
            onClick={() => void decline()}
            disabled={busy}
            className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:text-rose-600 hover:bg-rose-50 transition duration-150 disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => void approve()}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn transition duration-150 disabled:opacity-60"
          >
            <Icon name="check" className="w-[18px] h-[18px]" strokeWidth={2} />
            {busy ? "Provisioning…" : "Approve & Provision"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <span className="w-24 shrink-0 text-ink-faint font-semibold">{label}</span>
      <span className="text-ink font-medium break-all">{value}</span>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink-soft mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="block mt-1 text-[12px] font-semibold text-rose-600">{error}</span>
      ) : hint ? (
        <span className="block mt-1 text-[12px] text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}
