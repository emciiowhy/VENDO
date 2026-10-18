"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { formatPesoExact } from "@/lib/format";
import { getDiscountSettings, saveDiscountSettings, type DiscountSettings as Settings } from "@/lib/crm";
import { useSession } from "../auth/useSession";
import { PromotionsManager } from "./PromotionsManager";

/**
 * CRM → Discounts. The single place discounts are defined:
 *   • Promos — the OWNER sets each amount; cashiers can only tap one.
 *   • Senior Citizen / PWD — statutory (RA 9994 / RA 10754), shown read-only;
 *     nobody in the store can change the amount.
 *   • Loyalty — the OWNER sets the points rates and the member %.
 * Cashiers only ever pick one of these at the till; the server prices it.
 * Managers see the rules read-only (the API 403s their saves).
 */
const FIELD_INPUT =
  "field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] tabular-nums transition duration-150 ease-in-out";

type Form = { pesosPerPoint: string; pointValue: string; memberPct: string; memberMinSpend: string };

const toForm = (s: Settings): Form => ({
  pesosPerPoint: String(s.pesosPerPoint),
  pointValue: String(s.pointValueCents / 100),
  memberPct: String(s.memberDiscountPct),
  memberMinSpend: String(s.memberMinSpendCents / 100),
});

export function DiscountSettings() {
  const { push } = useToast();
  const session = useSession();
  const isOwner = session.status === "authed" && session.user.role === "MERCHANT_OWNER";
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getDiscountSettings();
      if (!alive) return;
      if (res.ok) setForm(toForm(res.settings));
      else setLoadError(res.error ?? "Could not load discount settings.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    // Money goes over the wire as integer centavos.
    const res = await saveDiscountSettings({
      pesosPerPoint: Math.round(Number(form.pesosPerPoint) || 0),
      pointValueCents: Math.round((Number(form.pointValue) || 0) * 100),
      memberDiscountPct: Math.round(Number(form.memberPct) || 0),
      memberMinSpendCents: Math.round((Number(form.memberMinSpend) || 0) * 100),
    });
    setSaving(false);
    if (res.ok) {
      setForm(toForm(res.settings));
      push({ variant: "success", title: "Discount settings saved" });
    } else {
      setErrors(res.errors ?? {});
      push({ variant: "danger", title: "Couldn't save", message: res.error ?? "Please fix the highlighted fields." });
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: e.target.value.replace(/[^\d.]/g, "") } : f));

  return (
    <div className="space-y-6">
      {session.status === "authed" && !isOwner && (
        <div className="flex items-center gap-2.5 rounded-[12px] bg-paper hairline px-4 py-3 text-[13.5px] text-ink-soft">
          <Icon name="lock" className="w-4 h-4 shrink-0" strokeWidth={1.8} />
          Only the store owner can create promos or change discount amounts.
        </div>
      )}

      {isOwner && <PromotionsManager />}

      <div className="grid gap-4 md:grid-cols-2">
        <StatutoryCard
          title="Senior Citizen"
          law="RA 9994 (Expanded Senior Citizens Act)"
          id="OSCA / Senior Citizen ID"
        />
        <StatutoryCard title="PWD" law="RA 10754 (PWD benefits)" id="PWD ID issued by the LGU / NCDA" />
      </div>

      <form onSubmit={save} className="rounded-xl2 bg-surface hairline shadow-card p-6 space-y-5">
        <div>
          <h3 className="text-[1.05rem] font-extrabold tracking-tight">Loyalty discounts</h3>
          <p className="text-[13px] text-ink-soft">
            Set by the owner. Cashiers can apply these at checkout but never change them.
          </p>
        </div>

        {loadError && <p className="text-[13px] font-semibold text-rose-600">{loadError}</p>}
        {!form && !loadError && <div className="h-32 rounded-[12px] bg-paper animate-pulse" />}

        {form && (
          <fieldset disabled={!isOwner} className="space-y-5 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Earn 1 point for every"
                prefix="₱"
                hint="Points accrue on what the customer actually paid."
                error={errors.pesosPerPoint}
              >
                <input value={form.pesosPerPoint} onChange={set("pesosPerPoint")} inputMode="numeric" className={FIELD_INPUT + " pl-7"} />
              </Field>
              <Field
                label="Each point is worth"
                prefix="₱"
                hint="Value when a customer redeems points at checkout."
                error={errors.pointValueCents}
              >
                <input value={form.pointValue} onChange={set("pointValue")} inputMode="decimal" className={FIELD_INPUT + " pl-7"} />
              </Field>
              <Field
                label="Member discount (%)"
                hint="0 turns it off. Max 50%. Never combined with Senior/PWD."
                error={errors.memberDiscountPct}
              >
                <input value={form.memberPct} onChange={set("memberPct")} inputMode="numeric" className={FIELD_INPUT} />
              </Field>
              <Field
                label="Member after lifetime spend of"
                prefix="₱"
                hint="0 = every CRM customer qualifies."
                error={errors.memberMinSpendCents}
              >
                <input value={form.memberMinSpend} onChange={set("memberMinSpend")} inputMode="decimal" className={FIELD_INPUT + " pl-7"} />
              </Field>
            </div>

            <div className="rounded-[10px] bg-paper hairline px-4 py-3 text-[13px] text-ink-soft">
              Example: a {formatPesoExact(500)} sale earns{" "}
              <b className="text-ink">{Math.floor(500 / Math.max(1, Number(form.pesosPerPoint) || 1))} pts</b>; 10 pts take{" "}
              <b className="text-ink">{formatPesoExact(10 * (Number(form.pointValue) || 0))}</b> off
              {Number(form.memberPct) > 0 && (
                <>
                  ; a member saves <b className="text-ink">{form.memberPct}%</b>
                </>
              )}
              .
            </div>

            {isOwner && (
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save loyalty settings"}
                </button>
              </div>
            )}
          </fieldset>
        )}
      </form>
    </div>
  );
}

function StatutoryCard({ title, law, id }: { title: string; law: string; id: string }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[1.05rem] font-extrabold tracking-tight">{title}</h3>
        <span className="inline-flex items-center gap-1 rounded-full bg-paper hairline px-2.5 py-1 text-[11.5px] font-semibold text-ink-faint">
          <Icon name="lock" className="w-3.5 h-3.5" strokeWidth={1.8} />
          Fixed by law
        </span>
      </div>
      <div className="text-[1.6rem] font-extrabold tracking-tightest text-brand-600">20% + VAT-exempt</div>
      <ul className="space-y-1 text-[13px] text-ink-soft">
        <li>{law}</li>
        <li>VAT is removed first, then 20% off — on eligible items only.</li>
        <li>Requires the {id} number and cardholder name.</li>
        <li>For the cardholder&rsquo;s exclusive use; can&rsquo;t be combined with other promos.</li>
        <li>Untick ineligible items in Product Management.</li>
      </ul>
    </div>
  );
}

function Field({
  label,
  hint,
  prefix,
  error,
  children,
}: {
  label: string;
  hint?: string;
  prefix?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[14.5px]">
            {prefix}
          </span>
        )}
        {children}
      </span>
      {error ? (
        <span className="block text-[12px] font-semibold text-rose-600">{error}</span>
      ) : (
        hint && <span className="block text-[12px] text-ink-faint">{hint}</span>
      )}
    </label>
  );
}
