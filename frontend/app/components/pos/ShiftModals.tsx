"use client";

import { useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatPesoExact } from "@/lib/format";
import { closeShift, openShift, type ActiveShift, type ShiftZRead } from "@/lib/pos";

/**
 * Cashier shift lifecycle UI (X-Read / Z-Read).
 *   • OpeningShiftModal — a blocking gate when a cashier takes the till: record
 *     the opening cash drawer float before any sale can be rung up.
 *   • ShiftCloseModal — the Z-Read: shows expected balances per channel, takes
 *     the PHYSICAL cash count, computes the centavo-exact variance, commits the
 *     immutable audit row, then locks the terminal.
 * Money is centavos end-to-end; pesos only appear at the input/display edge.
 */

const peso = (cents: number) => formatPesoExact(cents / 100);
const toCents = (v: string) => Math.round((Number(v) || 0) * 100);

const OPENING_PRESETS = [500, 1000, 2000, 3000]; // common baseline floats, pesos

/* ------------------------------ opening (X) ------------------------------ */

export function OpeningShiftModal({
  cashierName,
  defaultFloatCents = 0,
  onOpened,
  onExit,
}: {
  cashierName: string;
  /** Owner-set default opening float (centavos) — pre-fills the input. */
  defaultFloatCents?: number;
  onOpened: (shift: ActiveShift) => void;
  onExit: () => void;
}) {
  const [amount, setAmount] = useState(() => (defaultFloatCents > 0 ? String(defaultFloatCents / 100) : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = toCents(amount);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await openShift(cents);
    if (res.ok) {
      onOpened(res.shift);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not open the shift."));
  }

  return (
    <div className="fixed inset-0 z-[115] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Open shift">
      <div className="absolute inset-0 glass overlay-backdrop" />
      <div className="relative w-full max-w-[400px] rounded-xl2 bg-surface hairline shadow-soft overlay-card overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-50 grid place-items-center">
            <Icon name="lock" className="w-7 h-7 text-brand-600" strokeWidth={1.8} />
          </div>
          <h3 className="mt-4 text-[1.25rem] font-extrabold tracking-tightest">Open your shift</h3>
          <p className="mt-1 text-[13.5px] text-ink-soft leading-relaxed">
            Welcome, <span className="font-semibold text-ink">{cashierName}</span>. Count the cash already
            in the drawer (baseline change) before you start ringing up.
          </p>
        </div>

        <div className="px-6 pb-5 space-y-3">
          <label className="block">
            <span className="text-[12px] font-bold tracking-wide text-ink-faint uppercase">
              Opening cash drawer balance
            </span>
            <span className="relative mt-1.5 block">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[15px]">₱</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                autoFocus
                placeholder="0.00"
                className="field-input rounded-[10px] pl-7 pr-3 py-3 text-[16px] w-full text-right tabular-nums font-bold"
              />
            </span>
          </label>
          <div className="flex gap-2">
            {OPENING_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(String(p))}
                className="flex-1 rounded-[10px] bg-paper hairline py-2 text-[12.5px] font-bold tracking-tight text-ink hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 active:scale-[0.97] transition duration-150 tabular-nums"
              >
                ₱{p.toLocaleString("en-PH")}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 hairline-t flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="px-4 py-3 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:text-rose-600 hover:bg-rose-50 transition duration-150"
          >
            Exit terminal
          </button>
          <button
            type="button"
            onClick={() => void open()}
            disabled={busy || amount === ""}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="check" className="w-[18px] h-[18px]" strokeWidth={2} />
            {busy ? "Opening…" : "Open shift"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ closing (Z) ------------------------------ */

export function ShiftCloseModal({
  shift,
  onCancel,
  onClosed,
  finishLabel = "Finish & lock terminal",
  finishIcon = "lock",
}: {
  shift: ActiveShift;
  onCancel: () => void;
  onClosed: () => void;
  /** Copy + icon for the post-Z-Read confirm — a cashier locks out, an
   *  owner/manager returns to the back office (set by the terminal by role). */
  finishLabel?: string;
  finishIcon?: IconName;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zread, setZread] = useState<ShiftZRead | null>(null);

  const countedCents = toCents(counted);
  const previewVariance = countedCents - shift.expectedCashCents;

  async function commit() {
    setBusy(true);
    setError(null);
    const res = await closeShift(countedCents, note.trim() || undefined);
    if (res.ok) {
      setZread(res.zread);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Could not close the shift."));
  }

  // Phase 2 — the frozen Z-Read summary.
  if (zread) {
    return (
      <div className="fixed inset-0 z-[115] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Shift closed">
        <div className="absolute inset-0 glass overlay-backdrop" />
        <div className="relative w-full max-w-[400px] rounded-xl2 bg-surface hairline shadow-soft overlay-card overflow-hidden">
          <div className="px-6 pt-6 pb-4 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-accent-50 grid place-items-center">
              <Icon name="check" className="w-7 h-7 text-accent-600" strokeWidth={2.2} />
            </div>
            <p className="mt-3 text-[11px] font-bold tracking-wide text-ink-faint uppercase">Z-Read · shift closed</p>
            <h3 className="mt-1 text-[1.2rem] font-extrabold tracking-tightest">{zread.cashierName}</h3>
          </div>

          <div className="px-6 pb-2">
            <VarianceBadge variance={zread.cashVarianceCents} />
          </div>

          <div className="px-6 pb-5 pt-3">
            <div className="rounded-[12px] bg-paper hairline divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.07)] text-[13px]">
              <ZRow label="Opening float" value={peso(zread.openingCents)} />
              <ZRow label="Cash sales" value={peso(zread.cashSalesCents)} />
              <ZRow label="Expected drawer" value={peso(zread.expectedCashCents)} strong />
              <ZRow label="Counted (physical)" value={peso(zread.countedCashCents)} />
              <ZRow label="E-wallet (GCash/Maya)" value={peso(zread.ewalletSalesCents)} muted />
              <ZRow label="Card (QRPH)" value={peso(zread.cardSalesCents)} muted />
              <ZRow label={`Total sales · ${zread.txnCount} txns`} value={peso(zread.totalSalesCents)} strong />
            </div>
          </div>

          <div className="px-6 py-4 hairline-t">
            <button
              type="button"
              onClick={onClosed}
              className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink dark:bg-[#0b1220] hover:opacity-90 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150"
            >
              <Icon name={finishIcon} className="w-[18px] h-[18px]" strokeWidth={1.9} />
              {finishLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Phase 1 — reconciliation form.
  return (
    <div className="fixed inset-0 z-[115] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="End shift">
      <button type="button" aria-label="Close" onClick={onCancel} className="absolute inset-0 glass overlay-backdrop" />
      <div className="relative w-full max-w-[420px] rounded-xl2 bg-surface hairline shadow-soft overlay-card overflow-hidden max-h-[92vh] flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 hairline-b">
          <div>
            <h3 className="text-[1.15rem] font-extrabold tracking-tightest">End shift — Z-Read</h3>
            <p className="text-[12.5px] text-ink-soft">Reconcile the drawer before locking out.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {/* Expected breakdown */}
          <div className="rounded-[12px] bg-paper hairline divide-y divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.07)] text-[13px]">
            <ZRow label="Opening float" value={peso(shift.openingCents)} />
            <ZRow label="Cash sales" value={peso(shift.cashSalesCents)} />
            <ZRow label="Expected drawer cash" value={peso(shift.expectedCashCents)} strong />
            <ZRow label="E-wallet (GCash/Maya)" value={peso(shift.ewalletSalesCents)} muted />
            <ZRow label="Card (QRPH)" value={peso(shift.cardSalesCents)} muted />
            <ZRow label={`Total sales · ${shift.txnCount} txns`} value={peso(shift.totalSalesCents)} strong />
          </div>

          {/* Physical count */}
          <label className="block">
            <span className="text-[12px] font-bold tracking-wide text-ink-faint uppercase">
              Physical cash drawer count
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[15px]">₱</span>
                <input
                  value={counted}
                  onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  autoFocus
                  placeholder="0.00"
                  className="field-input rounded-[10px] pl-7 pr-3 py-3 text-[16px] w-full text-right tabular-nums font-bold"
                />
              </span>
              <button
                type="button"
                onClick={() => setCounted(String(shift.expectedCashCents / 100))}
                className="rounded-[10px] bg-paper hairline px-3 py-3 text-[12.5px] font-bold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
              >
                Exact
              </button>
            </div>
          </label>

          {counted !== "" && <VarianceBadge variance={previewVariance} />}

          <label className="block">
            <span className="text-[12px] font-semibold text-ink-soft">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
              placeholder="e.g. ₱20 short — wrong change given"
              className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full mt-1.5"
            />
          </label>

          {error && (
            <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 hairline-t flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
          >
            Keep selling
          </button>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={busy || counted === ""}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
            {busy ? "Closing…" : "Close shift & lock"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VarianceBadge({ variance }: { variance: number }) {
  const balanced = variance === 0;
  const over = variance > 0;
  const style = balanced
    ? "bg-accent-50 text-accent-600"
    : over
      ? "bg-amber-50 text-amber-600"
      : "bg-rose-50 text-rose-600";
  const label = balanced ? "Drawer balances exactly" : over ? "Overage" : "Shortage";
  return (
    <div className={"flex items-center justify-between rounded-[10px] px-3.5 py-2.5 " + style}>
      <span className="text-[13px] font-bold tracking-tight flex items-center gap-1.5">
        <Icon name={balanced ? "check" : "activity"} className="w-[16px] h-[16px]" strokeWidth={2} />
        {label}
      </span>
      <span className="text-[15px] font-extrabold tabular-nums tracking-tight">
        {balanced ? peso(0) : `${over ? "+" : "−"}${peso(Math.abs(variance))}`}
      </span>
    </div>
  );
}

function ZRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={muted ? "text-ink-faint" : "text-ink-soft"}>{label}</span>
      <span
        className={
          "tabular-nums tracking-tight " +
          (strong ? "font-extrabold text-ink" : muted ? "text-ink-faint" : "font-semibold")
        }
      >
        {value}
      </span>
    </div>
  );
}
