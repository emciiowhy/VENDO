"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../Icon";
import { Pagination } from "../Pagination";
import { useTheme } from "../theme/ThemeProvider";
import { formatCents } from "@/lib/format";
import {
  getSaleRecord,
  listSalesLedger,
  type SaleRecord,
  type SaleStatus,
  type SalesLedgerRow,
  type SalesLedgerSummary,
} from "@/lib/merchant";

/**
 * Owner/manager Sales ledger — every transaction the registers rang up, with
 * filters (date, status, payment, cashier, reference) and a rollup over the
 * filtered set. Clicking a sale opens its full record as a bento card: what
 * was sold and how many, when, who rang it up, how it was paid, VAT, discount
 * and any refunds. Read-only; voids/returns are still processed at the till.
 */

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      sales: SalesLedgerRow[];
      summary: SalesLedgerSummary;
      cashiers: { userId: string; name: string }[];
      total: number;
    };

const STATUS_META: Record<SaleStatus, { label: string; chip: string }> = {
  completed: { label: "Completed", chip: "bg-accent-50 text-accent-600" },
  partially_returned: { label: "Partly returned", chip: "bg-amber-50 text-amber-700" },
  returned: { label: "Returned", chip: "bg-amber-50 text-amber-700" },
  voided: { label: "Voided", chip: "bg-rose-50 text-rose-600" },
};

const PAYMENT_METHODS = ["Cash", "GCash", "Maya", "QRPH"] as const;

const SELECT =
  "field-input w-full rounded-[10px] px-3 py-2 text-[13.5px] transition duration-150 ease-in-out";

/** YYYY-MM-DD for a local date (the store's day, not UTC). */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

const QUICK_RANGES: { label: string; from: () => string }[] = [
  { label: "Today", from: () => daysAgo(0) },
  { label: "7 days", from: () => daysAgo(6) },
  { label: "30 days", from: () => daysAgo(29) },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export function SalesLedger() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<SaleStatus | "">("");
  const [method, setMethod] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [openId, setOpenId] = useState<string | null>(null);

  // Any filter change starts again from page 1.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  // Debounce the reference search so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listSalesLedger({ from, to, status, paymentMethod: method, cashierId, q: query, page, pageSize });
      if (!alive) return;
      if (res.ok)
        setState({ status: "ready", sales: res.sales, summary: res.summary, cashiers: res.cashiers, total: res.total });
      else setState({ status: "error", message: res.error ?? "Could not load sales." });
    })();
    return () => {
      alive = false;
    };
  }, [from, to, status, method, cashierId, query, page, pageSize]);

  const filtered = from !== "" || to !== "" || status !== "" || method !== "" || cashierId !== "" || query !== "";
  const s = state.status === "ready" ? state.summary : null;
  const today = isoDay(new Date());

  function clearAll() {
    setQ("");
    setQuery("");
    setFrom("");
    setTo("");
    setStatus("");
    setMethod("");
    setCashierId("");
    setPage(1);
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Sales</h2>
          <p className="text-[13.5px] text-ink-soft">
            Every transaction from your registers. Click a sale to see what was sold, when, and how it was paid.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_RANGES.map((r) => {
            const active = from === r.from() && to === today;
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => {
                  setFrom(r.from());
                  setTo(today);
                  setPage(1);
                }}
                className={
                  "px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition " +
                  (active ? "bg-brand-500 text-white" : "bg-surface hairline text-ink-soft hover:text-ink")
                }
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl2 bg-surface hairline shadow-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Reference</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. SI-000123"
            className={SELECT}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">From</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => filter(setFrom)(e.target.value)} className={SELECT} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">To</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => filter(setTo)(e.target.value)} className={SELECT} />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Status</span>
          <select value={status} onChange={(e) => filter(setStatus)(e.target.value as SaleStatus | "")} className={SELECT}>
            <option value="">All</option>
            {(Object.keys(STATUS_META) as SaleStatus[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_META[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Payment</span>
          <select value={method} onChange={(e) => filter(setMethod)(e.target.value)} className={SELECT}>
            <option value="">All</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-faint">Cashier</span>
          <select value={cashierId} onChange={(e) => filter(setCashierId)(e.target.value)} className={SELECT}>
            <option value="">Everyone</option>
            {state.status === "ready" &&
              state.cashiers.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          onClick={clearAll}
          disabled={!filtered && q === ""}
          className="h-[38px] px-4 rounded-[10px] text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-paper disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && s && (
        <>
          <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon="peso"
              label="Net sales"
              value={formatCents(s.netCents)}
              hint={s.refundedCents > 0 ? `${formatCents(s.refundedCents)} refunded` : undefined}
            />
            <Kpi icon="receipt" label="Transactions" value={s.txns.toLocaleString("en-PH")} />
            <Kpi icon="box" label="Items sold" value={s.itemsSold.toLocaleString("en-PH")} />
            <Kpi icon="chart" label="Average sale" value={formatCents(s.avgCents)} />
          </div>

          {s.byMethod.length > 0 && <PaymentMix summary={s} />}

          {state.sales.length === 0 ? (
            <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-14 text-center">
              <span className="inline-grid place-items-center w-12 h-12 rounded-[14px] bg-accent-50 text-accent-600">
                <Icon name="receipt" className="w-6 h-6" strokeWidth={1.6} />
              </span>
              <p className="mt-3 text-[14px] font-semibold">{filtered ? "No sales match these filters" : "No sales yet"}</p>
              <p className="mt-1 text-[13px] text-ink-soft max-w-[44ch] mx-auto">
                Every sale rung up at your Point of Sale lands here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="text-left text-[12px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                      <th className="px-5 py-2.5 font-semibold">Date &amp; time</th>
                      <th className="px-3 py-2.5 font-semibold">Reference</th>
                      <th className="px-3 py-2.5 font-semibold">Items</th>
                      <th className="px-3 py-2.5 font-semibold">Cashier</th>
                      <th className="px-3 py-2.5 font-semibold">Payment</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                      <th className="px-5 py-2.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.sales.map((sale) => {
                      const meta = STATUS_META[sale.status];
                      const more = sale.lineCount - sale.itemNames.length;
                      return (
                        <tr
                          key={sale.id}
                          tabIndex={0}
                          role="button"
                          aria-label={`Open sale ${sale.reference}`}
                          onClick={() => setOpenId(sale.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setOpenId(sale.id);
                            }
                          }}
                          className="border-b border-ink/5 last:border-0 hover:bg-paper/60 focus:bg-paper/60 focus:outline-none cursor-pointer transition"
                        >
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="font-semibold tabular-nums">{fmtDate(sale.createdAt)}</div>
                            <div className="text-[12px] text-ink-faint tabular-nums">{fmtTime(sale.createdAt)}</div>
                          </td>
                          <td className="px-3 py-3 font-mono text-ink-soft whitespace-nowrap">{sale.reference}</td>
                          <td className="px-3 py-3 min-w-[14rem]">
                            <div className="font-semibold">
                              {sale.itemsCount} {sale.itemsCount === 1 ? "item" : "items"}
                            </div>
                            <div className="text-[12px] text-ink-faint line-clamp-1">
                              {sale.itemNames.join(", ")}
                              {more > 0 ? ` +${more} more` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">{sale.cashierName ?? "—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-ink-soft">{sale.paymentMethod}</td>
                          <td className="px-3 py-3">
                            <span className={"inline-flex whitespace-nowrap text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " + meta.chip}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <div className="font-bold tracking-tight tabular-nums">{formatCents(sale.totalCents)}</div>
                            {sale.refundedCents > 0 && (
                              <div className="text-[12px] font-semibold text-rose-600 tabular-nums">
                                −{formatCents(sale.refundedCents)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                total={state.total}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
                noun="sales"
              />
            </div>
          )}
        </>
      )}

      {openId && <SaleBento saleId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** How the filtered sales were paid — one stacked bar plus a legend. */
function PaymentMix({ summary }: { summary: SalesLedgerSummary }) {
  const total = summary.byMethod.reduce((n, m) => n + Math.max(m.totalCents, 0), 0) || 1;
  const tones = ["bg-brand-500", "bg-accent-500", "bg-amber-500", "bg-brand-200"];
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="text-[12.5px] font-semibold text-ink-faint">Payment mix</div>
      <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-paper gap-[2px]">
        {summary.byMethod.map((m, i) => (
          <div
            key={m.method}
            className={tones[i % tones.length]}
            style={{ width: `${(Math.max(m.totalCents, 0) / total) * 100}%` }}
            title={`${m.method}: ${formatCents(m.totalCents)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {summary.byMethod.map((m, i) => (
          <div key={m.method} className="flex items-center gap-2">
            <span className={"w-2.5 h-2.5 rounded-full " + tones[i % tones.length]} />
            <span className="font-semibold">{m.method}</span>
            <span className="text-ink-soft tabular-nums">
              {formatCents(m.totalCents)} · {m.txns} {m.txns === 1 ? "sale" : "sales"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sale detail: bento card ─────────────────────────────────────────────────

function SaleBento({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const { theme } = useTheme();
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; sale: SaleRecord }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getSaleRecord(saleId);
      if (!alive) return;
      if (res.ok) setState({ status: "ready", sale: res.sale });
      else setState({ status: "error", message: res.error ?? "Could not load the sale." });
    })();
    return () => {
      alive = false;
    };
  }, [saleId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const sale = state.status === "ready" ? state.sale : null;

  return createPortal(
    // Portaled outside .theme-root, so carry the dark class + ink token in (as ConfirmDialog does).
    <div className={"text-ink " + (theme === "dark" ? "dark" : "")}>
      <div className="fixed inset-0 z-[125] grid place-items-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Sale details">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-sm overlay-backdrop" />
        <div className="relative w-full max-w-[860px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl2 bg-paper hairline shadow-soft p-4 sm:p-5 overlay-card">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-1 pb-4">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink-faint">Sale</div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[1.25rem] font-extrabold tracking-tight font-mono">{sale?.reference ?? "…"}</h3>
                {sale && (
                  <span className={"text-[11.5px] font-bold rounded-full px-2.5 py-0.5 " + STATUS_META[sale.status].chip}>
                    {STATUS_META[sale.status].label}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid place-items-center w-9 h-9 rounded-[10px] text-ink-soft hover:text-ink hover:bg-surface transition"
            >
              <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
            </button>
          </div>

          {state.status === "loading" && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 animate-pulse">
              <div className="col-span-2 row-span-2 rounded-xl2 bg-surface hairline h-[200px]" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl2 bg-surface hairline h-[94px]" />
              ))}
              <div className="col-span-2 md:col-span-4 rounded-xl2 bg-surface hairline h-[180px]" />
            </div>
          )}
          {state.status === "error" && (
            <div className="rounded-xl2 bg-surface hairline p-8 text-center">
              <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
            </div>
          )}
          {sale && <BentoGrid sale={sale} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BentoGrid({ sale }: { sale: SaleRecord }) {
  const units = sale.lines.reduce((n, l) => n + l.qty, 0);
  const returnedUnits = sale.lines.reduce((n, l) => n + l.returnedQty, 0);
  const refunded = sale.reversals.reduce((n, r) => n + r.amountCents, 0);
  const when = new Date(sale.createdAt);

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
      {/* Hero: amount + payment */}
      <Tile className="col-span-2 md:row-span-2 bg-brand-500 text-white border-transparent">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-white/80">
          <Icon name="peso" className="w-4 h-4" strokeWidth={1.8} />
          Total paid
        </div>
        <div className="mt-2 text-[2.4rem] leading-none font-extrabold tracking-tightest tabular-nums">
          {formatCents(sale.totalCents)}
        </div>
        {refunded > 0 && (
          <div className="mt-2 text-[13px] font-semibold text-white/90 tabular-nums">
            −{formatCents(refunded)} refunded · net {formatCents(sale.totalCents - refunded)}
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <div className="text-white/70 text-[12px]">Payment</div>
            <div className="font-bold">{sale.paymentMethod}</div>
            {sale.paymentRef && <div className="text-white/80 text-[12px] font-mono">Ref …{sale.paymentRef}</div>}
          </div>
          {sale.tenderedCents !== null && (
            <div>
              <div className="text-white/70 text-[12px]">Cash received</div>
              <div className="font-bold tabular-nums">{formatCents(sale.tenderedCents)}</div>
              {sale.changeCents !== null && (
                <div className="text-white/80 text-[12px] tabular-nums">Change {formatCents(sale.changeCents)}</div>
              )}
            </div>
          )}
        </div>
      </Tile>

      <StatTile icon="clock" label="Date" value={when.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} sub={when.toLocaleDateString("en-PH", { weekday: "long" })} />
      <StatTile icon="clock" label="Time" value={fmtTime(sale.createdAt)} sub="Manila time" />
      <StatTile
        icon="box"
        label="Quantity"
        value={`${units} ${units === 1 ? "item" : "items"}`}
        sub={`${sale.lines.length} ${sale.lines.length === 1 ? "product" : "products"}${returnedUnits > 0 ? ` · ${returnedUnits} returned` : ""}`}
      />
      <StatTile icon="users" label="Cashier" value={sale.cashierName ?? "—"} sub={sale.customerName ? `Customer: ${sale.customerName}` : "Walk-in customer"} />

      {/* What was sold */}
      <Tile className="col-span-2 md:col-span-4 p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 text-[12.5px] font-semibold text-ink-faint">
          <Icon name="cart" className="w-4 h-4" strokeWidth={1.8} />
          What was sold
        </div>
        <ul>
          {sale.lines.map((l) => (
            <li key={l.saleItemId} className="flex items-center gap-3 px-4 py-2.5 border-t border-ink/5">
              <span className="grid place-items-center min-w-[2.25rem] h-8 px-1.5 rounded-[8px] bg-brand-50 text-brand-700 text-[13px] font-extrabold tabular-nums">
                ×{l.qty}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] truncate">{l.name}</div>
                <div className="text-[12px] text-ink-faint tabular-nums">
                  {formatCents(l.unitPriceCents)} each
                  {l.vatClass !== "VATABLE" && ` · ${l.vatClass === "EXEMPT" ? "VAT-exempt" : "Zero-rated"}`}
                  {l.returnedQty > 0 && <span className="text-amber-700 font-semibold"> · {l.returnedQty} returned</span>}
                </div>
              </div>
              <div className="font-bold tabular-nums text-[14px]">{formatCents(l.unitPriceCents * l.qty)}</div>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between px-4 py-3 border-t border-ink/8 bg-paper/50 text-[13px]">
          <span className="text-ink-soft">Items total</span>
          <span className="font-bold tabular-nums">{formatCents(sale.grossCents)}</span>
        </div>
      </Tile>

      {/* Money breakdown */}
      <Tile className="col-span-2">
        <TileLabel icon="receipt">Breakdown</TileLabel>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <Row label="Items total" value={formatCents(sale.grossCents)} />
          {sale.discountCents > 0 && (
            <Row label={sale.discountLabel ?? "Discount"} value={`−${formatCents(sale.discountCents)}`} tone="text-accent-600" />
          )}
          {sale.vatCents > 0 && <Row label="VAT (included)" value={formatCents(sale.vatCents)} muted />}
          {sale.vatExemptCents > 0 && <Row label="VAT-exempt sales" value={formatCents(sale.vatExemptCents)} muted />}
          {sale.zeroRatedCents > 0 && <Row label="Zero-rated sales" value={formatCents(sale.zeroRatedCents)} muted />}
          <div className="pt-1.5 mt-1.5 border-t border-ink/8">
            <Row label="Total paid" value={formatCents(sale.totalCents)} bold />
          </div>
        </dl>
      </Tile>

      {/* Customer / benefit / loyalty */}
      <Tile className="col-span-2">
        <TileLabel icon="heart">Customer</TileLabel>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <Row label="Name" value={sale.customerName ?? "Walk-in"} />
          {sale.scPwdType && (
            <Row
              label={sale.scPwdType === "senior" ? "Senior Citizen" : "PWD"}
              value={[sale.scPwdName, sale.scPwdIdNumber].filter(Boolean).join(" · ") || "—"}
            />
          )}
          {(sale.pointsEarned > 0 || sale.pointsRedeemed > 0) && (
            <Row label="Points" value={`+${sale.pointsEarned} earned · ${sale.pointsRedeemed} used`} />
          )}
          {!sale.scPwdType && sale.pointsEarned === 0 && sale.pointsRedeemed === 0 && !sale.customerName && (
            <p className="text-ink-faint text-[12.5px]">No member or discount card on this sale.</p>
          )}
        </dl>
      </Tile>

      {/* Refunds against this sale */}
      {sale.reversals.length > 0 && (
        <Tile className="col-span-2 md:col-span-4">
          <TileLabel icon="refresh">Refunds &amp; voids</TileLabel>
          <ul className="mt-2 space-y-2">
            {sale.reversals.map((r) => (
              <li key={r.id} className="flex items-start gap-3 text-[13px]">
                <span
                  className={
                    "shrink-0 text-[11px] font-bold rounded-full px-2 py-0.5 " +
                    (r.kind === "void" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700")
                  }
                >
                  {r.kind === "void" ? "Void" : "Return"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    <span className="font-mono">{r.reference}</span> · {r.processedBy ?? "—"} ·{" "}
                    <span className="text-ink-faint font-normal">
                      {fmtDate(r.createdAt)} {fmtTime(r.createdAt)}
                    </span>
                  </div>
                  {r.reason && <div className="text-ink-soft">“{r.reason}”</div>}
                </div>
                <div className="font-bold tabular-nums text-rose-600">−{formatCents(r.amountCents)}</div>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </div>
  );
}

function Tile({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={"rounded-xl2 bg-surface hairline shadow-card p-4 " + className}>{children}</div>;
}

function TileLabel({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-faint">
      <Icon name={icon} className="w-4 h-4" strokeWidth={1.8} />
      {children}
    </div>
  );
}

function StatTile({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <Tile>
      <TileLabel icon={icon}>{label}</TileLabel>
      <div className="mt-2 text-[1.15rem] leading-tight font-extrabold tracking-tight truncate">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-soft truncate">{sub}</div>}
    </Tile>
  );
}

function Row({
  label,
  value,
  tone,
  muted,
  bold,
}: {
  label: string;
  value: string;
  tone?: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? "text-ink-faint" : "text-ink-soft"}>{label}</dt>
      <dd className={"tabular-nums text-right " + (bold ? "font-extrabold " : "font-semibold ") + (tone ?? (muted ? "text-ink-faint" : ""))}>
        {value}
      </dd>
    </div>
  );
}

function Kpi({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-brand-50 text-brand-600">
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="mt-3 text-[1.5rem] sm:text-[1.7rem] leading-none font-extrabold tracking-tightest tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12.5px] text-ink-soft">{label}</div>
      {hint && <div className="mt-0.5 text-[12px] font-semibold text-rose-600">{hint}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
        ))}
      </div>
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[320px]" />
    </div>
  );
}
