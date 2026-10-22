"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ConfirmDialog";
import { promoAmountText } from "@/lib/pos";
import { deletePromotion, listPromotions, savePromotion, type Promotion, type PromotionFields } from "@/lib/crm";

/**
 * Owner-only promo list. The owner fixes each promo's amount here; at the till a
 * cashier can only tap an ACTIVE promo — they never see or change the amount
 * field. Pausing a promo removes it from the register on its next refresh.
 */
const FIELD_INPUT =
  "field-input w-full rounded-[10px] px-3.5 py-2.5 text-[14px] transition duration-150 ease-in-out";

type Draft = { id?: string; name: string; kind: "percent" | "fixed"; amount: string; isActive: boolean };

const EMPTY: Draft = { name: "", kind: "percent", amount: "", isActive: true };

const toDraft = (p: Promotion): Draft => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  amount: p.kind === "percent" ? String(p.value) : String(p.value / 100),
  isActive: p.isActive,
});

export function PromotionsManager() {
  const { push } = useToast();
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Promotion | null>(null);

  async function reload() {
    const res = await listPromotions();
    if (res.ok) setPromos(res.promotions);
    else setLoadError(res.error ?? "Could not load promos.");
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listPromotions();
      if (!alive) return;
      if (res.ok) setPromos(res.promotions);
      else setLoadError(res.error ?? "Could not load promos.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toFields(d: Draft): PromotionFields {
    const n = Number(d.amount) || 0;
    // Wire format: whole percent, or integer centavos for a fixed promo.
    return { name: d.name.trim(), kind: d.kind, value: d.kind === "percent" ? Math.round(n) : Math.round(n * 100), isActive: d.isActive };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setErrors({});
    const res = await savePromotion(toFields(draft), draft.id);
    setSaving(false);
    if (res.ok) {
      push({ variant: "success", title: draft.id ? "Promo updated" : "Promo added" });
      setDraft(null);
      void reload();
    } else {
      setErrors(res.errors ?? {});
      if (!res.errors) push({ variant: "danger", title: "Couldn't save", message: res.error });
    }
  }

  async function toggle(p: Promotion) {
    const res = await savePromotion({ name: p.name, kind: p.kind, value: p.value, isActive: !p.isActive }, p.id);
    if (res.ok) void reload();
    else push({ variant: "danger", title: "Couldn't update", message: res.error });
  }

  async function remove() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    const res = await deletePromotion(target.id);
    if (res.ok) {
      push({ variant: "success", title: "Promo deleted" });
      void reload();
    } else {
      push({ variant: "danger", title: "Couldn't delete", message: res.error });
    }
  }

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[1.05rem] font-extrabold tracking-tight">Promos</h3>
          <p className="text-[13px] text-ink-soft">
            You set the amount. Cashiers can only tap an active promo at the register — they can&rsquo;t change it.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={() => {
              setErrors({});
              setDraft(EMPTY);
            }}
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-4 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150"
          >
            <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
            Add promo
          </button>
        )}
      </div>

      {draft && (
        <form onSubmit={save} className="rounded-[12px] bg-paper hairline p-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_140px]">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-soft">Promo name</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Payday Sale"
                maxLength={40}
                className={FIELD_INPUT}
                autoFocus
              />
              {errors.name && <span className="block text-[12px] font-semibold text-rose-600">{errors.name}</span>}
            </label>
            <div className="space-y-1.5">
              <span className="block text-[13px] font-semibold text-ink-soft">Type</span>
              <div className="flex rounded-[10px] bg-surface hairline p-0.5">
                {(["percent", "fixed"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraft({ ...draft, kind: k })}
                    aria-pressed={draft.kind === k}
                    className={
                      "press px-3.5 py-2 rounded-[8px] text-[13px] font-bold " +
                      (draft.kind === k ? "bg-brand-50 text-brand-700" : "text-ink-soft")
                    }
                  >
                    {k === "percent" ? "% off" : "₱ off"}
                  </button>
                ))}
              </div>
            </div>
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-ink-soft">{draft.kind === "percent" ? "Percent" : "Amount (₱)"}</span>
              <input
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d.]/g, "") })}
                inputMode="decimal"
                placeholder={draft.kind === "percent" ? "10" : "50.00"}
                className={FIELD_INPUT + " tabular-nums"}
              />
              {errors.value && <span className="block text-[12px] font-semibold text-rose-600">{errors.value}</span>}
            </label>
          </div>
          <label className="flex items-center gap-2.5 text-[13.5px] text-ink">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              className="h-4 w-4 accent-brand-500"
            />
            Active — show it on the register now
          </label>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:text-ink hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150 disabled:opacity-50"
            >
              {saving ? "Saving…" : draft.id ? "Save promo" : "Add promo"}
            </button>
          </div>
        </form>
      )}

      {loadError && <p className="text-[13px] font-semibold text-rose-600">{loadError}</p>}
      {!promos && !loadError && <div className="h-20 rounded-[12px] bg-paper animate-pulse" />}
      {promos && promos.length === 0 && !draft && (
        <p className="rounded-[12px] bg-paper hairline px-4 py-6 text-center text-[13.5px] text-ink-soft">
          No promos yet. Add one and it appears as a button on the register.
        </p>
      )}
      {promos && promos.length > 0 && (
        <ul className="divide-y divide-ink/8 rounded-[12px] hairline overflow-hidden">
          {promos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] truncate">{p.name}</div>
                <div className="text-[12.5px] text-ink-soft">{promoAmountText(p)}</div>
              </div>
              <span
                className={
                  "rounded-full px-2.5 py-1 text-[11.5px] font-semibold " +
                  (p.isActive ? "bg-accent-50 text-accent-600" : "bg-paper text-ink-faint hairline")
                }
              >
                {p.isActive ? "Active" : "Paused"}
              </span>
              <button
                type="button"
                onClick={() => void toggle(p)}
                className="px-3 py-1.5 rounded-[8px] text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 hover:bg-brand-50"
              >
                {p.isActive ? "Pause" : "Activate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrors({});
                  setDraft(toDraft(p));
                }}
                aria-label={`Edit ${p.name}`}
                className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:bg-brand-50 hover:text-brand-600"
              >
                <Icon name="pencil" className="w-[16px] h-[16px]" strokeWidth={1.7} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(p)}
                aria-label={`Delete ${p.name}`}
                className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:bg-rose-50 hover:text-rose-600"
              >
                <Icon name="trash" className="w-[16px] h-[16px]" strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete this promo?"
          message={`“${confirmDelete.name}” disappears from the register. Past sales keep its name on their receipts.`}
          confirmLabel="Delete promo"
          danger
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
