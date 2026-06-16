"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  getSaleDetail,
  listSales,
  returnSaleLines,
  voidSale,
  type PaymentMethod,
  type Reversal,
  type Sale,
  type SaleDetail,
  type SaleStatus,
  type SaleSummary,
  type StoreBrand,
} from "@/lib/pos";
import { printRefundSlip, printSaleReceipt, type TicketItem } from "./receiptPrint";

/**
 * The register's Sales & Returns desk. Pick a recent sale, then either void it
 * whole or return specific lines/quantities. Every peso of the refund is decided
 * by the server (proportional discount + 12% VAT); the estimate shown here just
 * mirrors that maths so the cashier sees what's coming before they commit.
 */
type View = "list" | "detail" | "result";

const STATUS_BADGE: Record<SaleStatus, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-accent-50 text-accent-700" },
  partially_returned: { label: "Partly returned", cls: "bg-amber-50 text-amber-700" },
  returned: { label: "Returned", cls: "bg-rose-50 text-rose-600" },
  voided: { label: "Voided", cls: "bg-rose-50 text-rose-600" },
};

export function SalesReturnsModal({
  store,
  onClose,
  onReversed,
}: {
  store: StoreBrand;
  onClose: () => void;
  /** Fired after a successful void/return so the terminal can refresh tallies. */
  onReversed: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<{ reversal: Reversal; originalRef: string; items: TicketItem[] } | null>(null);

  // Manual refresh (event-handler context — synchronous setState is fine here).
  const loadList = useCallback(async () => {
    setLoadingList(true);
    const res = await listSales(50);
    setSales(res.ok ? res.sales : []);
    setLoadingList(false);
  }, []);

  // Initial load: no setState before the await (keeps it out of the cascading-
  // render path the lint guards against); loadingList starts true.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listSales(50);
      if (!alive) return;
      setSales(res.ok ? res.sales : []);
      setLoadingList(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openSale = useCallback(async (id: string) => {
    setView("detail");
    setLoadingDetail(true);
    setError(null);
    setReason("");
    const res = await getSaleDetail(id);
    if (res.ok) {
      setDetail(res.sale);
      setQty(Object.fromEntries(res.sale.lines.map((l) => [l.saleItemId, 0])));
    } else {
      setError(res.error ?? "Could not load the sale.");
      setDetail(null);
    }
    setLoadingDetail(false);
  }, []);

  const backToList = useCallback(() => {
    setView("list");
    setDetail(null);
    setError(null);
    void loadList();
  }, [loadList]);

  // Selected lines + the refund estimate (mirrors the server's computeRefund).
  const selectedLines = useMemo(
    () => (detail?.lines ?? []).filter((l) => (qty[l.saleItemId] ?? 0) > 0),
    [detail, qty],
  );
  const returnedGross = useMemo(
    () => selectedLines.reduce((s, l) => s + l.unitPriceCents * (qty[l.saleItemId] ?? 0), 0),
    [selectedLines, qty],
  );
  const refundEstimate = useMemo(() => {
    if (!detail) return 0;
    const originalGross = detail.totalCents + detail.discountCents;
    const discountShare =
      detail.discountCents > 0 && originalGross > 0
        ? Math.round((detail.discountCents * returnedGross) / originalGross)
        : 0;
    return returnedGross - discountShare;
  }, [detail, returnedGross]);

  const canVoid = detail?.status === "completed";
  const canReturn = selectedLines.length > 0;

  const ticketItems = useCallback(
    (lines: { name: string; unitPriceCents: number; saleItemId: string; returnableQty: number }[], whole: boolean): TicketItem[] =>
      lines
        .map((l) => ({
          name: l.name,
          unitCents: l.unitPriceCents,
          qty: whole ? l.returnableQty : qty[l.saleItemId] ?? 0,
        }))
        .filter((it) => it.qty > 0),
    [qty],
  );

  const doVoid = useCallback(async () => {
    if (!detail) return;
    setSubmitting(true);
    setError(null);
    const res = await voidSale(detail.id, reason.trim() || undefined);
    setSubmitting(false);
    if (res.ok) {
      setResult({
        reversal: res.reversal,
        originalRef: detail.reference,
        items: ticketItems(detail.lines, true),
      });
      setView("result");
      onReversed();
    } else {
      setError(res.error ?? "Could not void the sale.");
    }
  }, [detail, reason, ticketItems, onReversed]);

  const doReturn = useCallback(async () => {
    if (!detail) return;
    const lines = selectedLines.map((l) => ({ saleItemId: l.saleItemId, qty: qty[l.saleItemId] ?? 0 }));
    setSubmitting(true);
    setError(null);
    const res = await returnSaleLines(detail.id, lines, reason.trim() || undefined);
    setSubmitting(false);
    if (res.ok) {
      setResult({
        reversal: res.reversal,
        originalRef: detail.reference,
        items: ticketItems(detail.lines, false),
      });
      setView("result");
      onReversed();
    } else {
      setError(res.error ?? "Could not process the return.");
    }
  }, [detail, selectedLines, qty, reason, ticketItems, onReversed]);

  const setLineQty = (id: string, next: number, max: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(next, max)) }));

  // Reprint the original invoice exactly as issued (full sold quantities).
  const reprintReceipt = useCallback(() => {
    if (!detail) return;
    const saleForPrint: Sale = {
      id: detail.id,
      reference: detail.reference,
      subtotalCents: detail.subtotalCents,
      vatCents: detail.vatCents,
      grossCents: detail.grossCents,
      discountCents: detail.discountCents,
      discountLabel: detail.discountLabel,
      totalCents: detail.totalCents,
      paymentMethod: detail.paymentMethod as PaymentMethod,
      paymentRef: detail.paymentRef,
      tenderedCents: detail.tenderedCents,
      changeCents: detail.changeCents,
      // Loyalty isn't part of the sale-detail payload; a reprint reissues the
      // money figures exactly and omits the points footer.
      pointsEarned: 0,
      pointsRedeemed: 0,
      createdAt: detail.createdAt,
    };
    printSaleReceipt({
      store,
      sale: saleForPrint,
      items: detail.lines.map((l) => ({ name: l.name, qty: l.qty, unitCents: l.unitPriceCents })),
      cashierName: detail.cashierName,
      soldTo: detail.customerName,
      titleNote: "(REPRINT)",
    });
  }, [detail, store]);

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Sales and returns">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 glass overlay-backdrop" />

      <div className="relative w-full max-w-[460px] max-h-[88vh] flex flex-col rounded-xl2 bg-surface hairline shadow-soft overlay-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4 hairline-b">
          {view !== "list" && (
            <button
              type="button"
              onClick={view === "result" ? backToList : () => setView("list")}
              aria-label="Back"
              className="grid place-items-center w-8 h-8 -ml-1 rounded-[9px] text-ink-soft hover:text-ink hover:bg-paper transition"
            >
              <Icon name="arrow" className="w-[18px] h-[18px] rotate-180" strokeWidth={1.8} />
            </button>
          )}
          <div className="min-w-0">
            <h3 className="text-[1.1rem] font-extrabold tracking-tight">
              {view === "result" ? "Done" : "Sales & Returns"}
            </h3>
            <p className="text-[12.5px] text-ink-soft truncate">
              {view === "list"
                ? "Void a sale or return items."
                : view === "detail"
                  ? detail?.reference ?? "Loading…"
                  : "The reversal is recorded."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-ink-faint hover:text-ink transition p-1"
          >
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-[10px] bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-[12.5px] text-rose-700">
              <Icon name="ban" className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.9} />
              <span>{error}</span>
            </div>
          )}

          {/* ── List ── */}
          {view === "list" &&
            (loadingList ? (
              <p className="py-10 text-center text-[13px] text-ink-soft">Loading sales…</p>
            ) : sales.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-soft">No sales rung up yet.</p>
            ) : (
              <div className="space-y-1.5">
                {sales.map((s) => {
                  const badge = STATUS_BADGE[s.status];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void openSale(s.id)}
                      className="w-full flex items-center gap-3 rounded-[11px] bg-paper hairline px-3.5 py-3 text-left hover:border-brand-200 hover:bg-brand-50 transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[13.5px] tracking-tight font-mono">{s.reference}</div>
                        <div className="text-[11.5px] text-ink-faint">
                          {new Date(s.createdAt).toLocaleString("en-PH", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {s.cashierName ? ` · ${s.cashierName}` : ""}
                        </div>
                      </div>
                      <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <div className="text-right font-bold tabular-nums tracking-tight text-[13.5px]">
                        {formatCents(s.totalCents)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

          {/* ── Detail ── */}
          {view === "detail" &&
            (loadingDetail || !detail ? (
              <p className="py-10 text-center text-[13px] text-ink-soft">Loading sale…</p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[12.5px] text-ink-soft">
                    {detail.paymentMethod}
                    {detail.customerName ? ` · ${detail.customerName}` : ""}
                  </div>
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[detail.status].cls}`}>
                    {STATUS_BADGE[detail.status].label}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={reprintReceipt}
                  className="mb-3 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-surface hairline py-2.5 font-semibold text-[13px] text-ink-soft hover:text-brand-600 hover:border-brand-200 transition"
                >
                  <Icon name="receipt" className="w-[17px] h-[17px]" strokeWidth={1.8} />
                  Print receipt
                </button>

                {detail.status === "voided" || detail.status === "returned" ? (
                  <div className="rounded-[11px] bg-paper hairline px-4 py-5 text-center text-[13px] text-ink-soft">
                    This sale has already been {detail.status === "voided" ? "voided" : "fully returned"}. Nothing
                    left to reverse.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {detail.lines.map((l) => {
                        const sel = qty[l.saleItemId] ?? 0;
                        const exhausted = l.returnableQty === 0;
                        return (
                          <div
                            key={l.saleItemId}
                            className={"rounded-[11px] bg-paper hairline px-3.5 py-2.5 " + (exhausted ? "opacity-55" : "")}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-bold text-[13.5px] tracking-tight truncate">{l.name}</div>
                                <div className="text-[11.5px] text-ink-faint">
                                  {formatCents(l.unitPriceCents)} · sold {l.qty}
                                  {l.returnedQty > 0 ? ` · returned ${l.returnedQty}` : ""}
                                </div>
                              </div>
                              {exhausted ? (
                                <span className="text-[11px] font-bold text-ink-faint">Returned</span>
                              ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <Stepper
                                    onDec={() => setLineQty(l.saleItemId, sel - 1, l.returnableQty)}
                                    onInc={() => setLineQty(l.saleItemId, sel + 1, l.returnableQty)}
                                    value={sel}
                                    max={l.returnableQty}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (optional)"
                      maxLength={280}
                      className="mt-3 w-full rounded-[10px] bg-paper hairline px-3.5 py-2.5 text-[13px] outline-none focus:border-brand-300 transition"
                    />

                    {returnedGross > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-[10px] bg-brand-50 px-3.5 py-2.5 text-[13px]">
                        <span className="font-semibold text-brand-700">Refund (est.)</span>
                        <span className="font-extrabold tabular-nums text-brand-700">{formatCents(refundEstimate)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

          {/* ── Result ── */}
          {view === "result" && result && (
            <div className="text-center py-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-accent-50 grid place-items-center">
                <Icon name="check" className="w-7 h-7 text-accent-600" strokeWidth={2.3} />
              </div>
              <h4 className="mt-3 text-[1.15rem] font-extrabold tracking-tight">
                {result.reversal.kind === "void" ? "Sale voided" : "Refund processed"}
              </h4>
              <p className="mt-1 text-[13px] text-ink-soft">
                {formatCents(Math.abs(result.reversal.totalCents))} refunded via {result.reversal.paymentMethod}
              </p>
              <div className="mt-4 rounded-[12px] bg-paper hairline divide-y divide-[rgba(11,18,32,0.07)] text-[13px] text-left">
                <ResRow label="Slip ref" value={result.reversal.reference} mono />
                <ResRow label="Against" value={result.originalRef} mono />
                <ResRow label="VAT (12% incl.)" value={formatCents(Math.abs(result.reversal.vatCents))} />
              </div>
              <button
                type="button"
                onClick={() =>
                  printRefundSlip({
                    store,
                    reversal: result.reversal,
                    originalReference: result.originalRef,
                    items: result.items,
                  })
                }
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-surface hairline py-3 font-semibold text-[14px] hover:border-brand-200 hover:text-brand-600 transition"
              >
                <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                Print refund slip
              </button>
            </div>
          )}
        </div>

        {/* Footer actions (detail only) */}
        {view === "detail" && detail && detail.status !== "voided" && detail.status !== "returned" && (
          <div className="px-5 py-4 hairline-t grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={!canVoid || submitting}
              onClick={() => void doVoid()}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-surface hairline py-3 font-semibold text-[13.5px] text-rose-600 hover:border-rose-200 disabled:opacity-40 disabled:hover:border-[var(--hairline)] transition"
              title={canVoid ? "Cancel the whole sale" : "Sales with returns can't be voided — return the rest"}
            >
              <Icon name="ban" className="w-[18px] h-[18px]" strokeWidth={1.9} />
              Void sale
            </button>
            <button
              type="button"
              disabled={!canReturn || submitting}
              onClick={() => void doReturn()}
              className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-600 text-white py-3 font-bold text-[13.5px] hover:bg-brand-700 disabled:opacity-40 transition"
            >
              <Icon name="refresh" className="w-[18px] h-[18px]" strokeWidth={1.9} />
              {submitting ? "Processing…" : "Return selected"}
            </button>
          </div>
        )}

        {view === "result" && (
          <div className="px-5 py-4 hairline-t">
            <button
              type="button"
              onClick={backToList}
              className="w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white transition"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({
  value,
  max,
  onDec,
  onInc,
}: {
  value: number;
  max: number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onDec}
        disabled={value <= 0}
        aria-label="Less"
        className="grid place-items-center w-8 h-8 rounded-[8px] bg-surface hairline text-ink-soft text-[18px] leading-none disabled:opacity-35 hover:border-brand-200 transition"
      >
        −
      </button>
      <span className="w-7 text-center font-bold tabular-nums text-[14px]">{value}</span>
      <button
        type="button"
        onClick={onInc}
        disabled={value >= max}
        aria-label="More"
        className="grid place-items-center w-8 h-8 rounded-[8px] bg-surface hairline text-ink-soft disabled:opacity-35 hover:border-brand-200 transition"
      >
        <Icon name="plus" className="w-4 h-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function ResRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-ink-soft">{label}</span>
      <span className={(mono ? "font-mono " : "") + "font-semibold tabular-nums tracking-tight"}>{value}</span>
    </div>
  );
}
