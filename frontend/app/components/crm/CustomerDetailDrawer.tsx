"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { formatCents, formatCentsWhole, formatDate } from "@/lib/format";
import { getCustomer, type CustomerDetail } from "@/lib/crm";

/** Right-side drawer: a customer's profile, loyalty, lifetime stats and recent sales. */
export function CustomerDetailDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: (c: CustomerDetail) => void;
}) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCustomer(id);
      if (!alive) return;
      if (res.ok) setCustomer(res.customer);
      else setError(res.error ?? "Could not load the customer.");
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex justify-end" role="dialog" aria-modal="true" aria-label="Customer detail">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-[460px] h-full bg-surface hairline shadow-soft overflow-y-auto">
        {!customer ? (
          <div className="p-6">
            {error ? (
              <p className="text-[14px] font-semibold text-rose-600">{error}</p>
            ) : (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 w-40 rounded-lg bg-paper" />
                <div className="h-24 rounded-xl2 bg-paper" />
                <div className="h-40 rounded-xl2 bg-paper" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="sticky top-0 bg-surface hairline-b px-6 py-4 flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="text-[1.2rem] font-extrabold tracking-tight truncate">{customer.name}</h3>
                <p className="mt-0.5 text-[13px] text-ink-soft">
                  {customer.phone ?? customer.email ?? "No contact on file"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => onEdit(customer)} aria-label="Edit" title="Edit" className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:bg-brand-50 hover:text-brand-600 transition">
                  <Icon name="pencil" className="w-[17px] h-[17px]" strokeWidth={1.7} />
                </button>
                <button type="button" onClick={onClose} aria-label="Close" className="grid place-items-center w-8 h-8 rounded-[9px] text-ink-faint hover:text-ink transition">
                  <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Loyalty + lifetime stats */}
              <div className="rounded-xl2 bg-brand-50 p-4 flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-semibold text-brand-600">Loyalty points</div>
                  <div className="text-[1.9rem] font-extrabold tracking-tightest tabular-nums text-brand-700">
                    {customer.loyaltyPoints.toLocaleString("en-PH")}
                  </div>
                </div>
                <Icon name="heart" className="w-9 h-9 text-brand-300" strokeWidth={1.6} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Stat label="Orders" value={String(customer.orderCount)} />
                <Stat label="Lifetime spend" value={formatCentsWhole(customer.totalSpentCents)} />
                <Stat label="Last visit" value={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"} />
              </div>

              {customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {customer.tags.map((t) => (
                    <span key={t} className="text-[11.5px] font-bold rounded-full px-2.5 py-0.5 bg-paper hairline text-ink-soft">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {customer.note && (
                <div className="rounded-[10px] bg-paper hairline p-3 text-[13px] text-ink-soft">
                  <span className="font-semibold text-ink">Note:</span> {customer.note}
                </div>
              )}

              {/* Purchase history */}
              <div>
                <h4 className="font-extrabold tracking-tight text-[14px] mb-2">Purchase history</h4>
                {customer.recentSales.length === 0 ? (
                  <p className="text-[13px] text-ink-soft rounded-[10px] bg-paper hairline p-4 text-center">
                    No purchases yet. Attach this customer at POS checkout to start their history.
                  </p>
                ) : (
                  <div className="rounded-xl2 hairline overflow-hidden">
                    <table className="w-full text-[13px]">
                      <tbody>
                        {customer.recentSales.map((s) => (
                          <tr key={s.id} className="border-b border-ink/5 last:border-0">
                            <td className="px-3 py-2.5 font-bold tabular-nums">{s.reference}</td>
                            <td className="px-2 py-2.5 text-ink-soft">{s.paymentMethod}</td>
                            <td className="px-2 py-2.5 text-ink-faint tabular-nums whitespace-nowrap">{formatDate(s.createdAt)}</td>
                            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{formatCents(s.totalCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-paper hairline px-3 py-2.5">
      <div className="text-[11px] font-semibold text-ink-faint">{label}</div>
      <div className="mt-0.5 font-extrabold tracking-tight tabular-nums text-[14px]">{value}</div>
    </div>
  );
}
