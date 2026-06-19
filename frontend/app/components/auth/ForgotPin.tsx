"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { listStoreCashiers, requestPinReset } from "@/lib/auth";

/**
 * Forgot-PIN request flow, embedded inside the PIN modals. Cashiers can't set
 * their own PIN — this raises a request for the OWNER to reset it.
 *  • Warm switcher passes `preset` (a cashier is already selected) → one tap.
 *  • Cold login passes `storeId` → fetch the store's cashiers and pick one.
 * On success it shows the manager-notified confirmation.
 */
export function ForgotPin({
  storeId,
  preset,
  onBack,
}: {
  storeId?: string;
  preset?: { id: string; name: string };
  onBack: () => void;
}) {
  const [cashiers, setCashiers] = useState<{ id: string; name: string }[] | null>(
    preset ? [preset] : null,
  );
  const [loading, setLoading] = useState(!preset);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (preset) return; // already have the one cashier
    let alive = true;
    void (async () => {
      const res = await listStoreCashiers(storeId ? { storeId } : {});
      if (!alive) return;
      if (res.ok) setCashiers(res.cashiers);
      else setError(res.error);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [preset, storeId]);

  async function submit(cashierId: string) {
    setSubmitting(true);
    setError(null);
    const res = await requestPinReset(cashierId, storeId ? { storeId } : {});
    setSubmitting(false);
    if (res.ok) setSent(res.message);
    else setError(res.error);
  }

  if (sent) {
    return (
      <div role="status" aria-live="polite" className="mt-6 text-center step-in">
        <div className="mx-auto w-14 h-14 rounded-full bg-accent-50 grid place-items-center">
          <Icon name="check" className="w-7 h-7 text-accent-600" strokeWidth={2.2} />
        </div>
        <h4 className="mt-3 text-[1.05rem] font-extrabold tracking-tight">Request sent</h4>
        <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">{sent}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150"
        >
          Back to PIN
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 step-in">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink transition"
      >
        <Icon name="chevron" className="w-4 h-4 rotate-90" />
        Back
      </button>
      <h4 className="mt-3 text-[1.05rem] font-extrabold tracking-tight">Forgot your PIN?</h4>
      <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">
        {preset
          ? `Ask your store owner to reset the PIN for ${preset.name}.`
          : "Pick your profile — your store owner will be notified to set a new PIN."}
      </p>

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose-600">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {loading ? (
          <div role="status">
            <span className="sr-only">Loading profiles…</span>
            <div aria-hidden="true" className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-[12px] bg-paper hairline px-4 py-3"
                >
                  <span className="skeleton w-9 h-9 rounded-full shrink-0" />
                  <span className="skeleton h-3.5 w-1/2 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : !cashiers || cashiers.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-ink-soft">
            No cashier profiles found for this store.
          </p>
        ) : (
          cashiers.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={submitting}
              onClick={() => void submit(c.id)}
              className="flex w-full items-center gap-3 rounded-[12px] bg-paper hairline px-4 py-3 text-left hover:border-brand-200 hover:bg-brand-50 active:scale-[0.99] transition duration-150 disabled:opacity-50"
            >
              <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-500 text-white font-bold text-[13px] tracking-tight shrink-0">
                {initials(c.name)}
              </span>
              <span className="font-bold tracking-tight">{c.name}</span>
              <Icon name="chevron" className="ml-auto w-4 h-4 -rotate-90 text-ink-faint" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}
