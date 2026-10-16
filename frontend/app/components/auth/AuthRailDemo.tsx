"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BrandMark } from "../BrandMark";
import { Icon } from "../Icon";

/**
 * The product-in-motion highlight in the brand rail of /login and /signup.
 *
 * A code-rendered register (it replaced a pre-recorded clip that showed a
 * barcode scanner we don't ship): the cashier taps three items, the totals —
 * with VAT split out at 12/112, exactly as the POS computes it — update, Charge
 * is pressed, and a thermal receipt prints. Then it loops.
 *
 * Reduced motion renders the finished, printed state as a still. The frame
 * reserves its 4:3 ratio up front so the rail never shifts, and it's decorative
 * (aria-hidden) so it never traps focus.
 */

const ITEMS = [
  { initial: "K", name: "Kape Barako", sku: "KNJ-BRK-01", qty: 1, cents: 12000, tone: "bg-amber-100 text-amber-800" },
  { initial: "P", name: "Pandesal", sku: "KNJ-PDS-06", qty: 6, cents: 6000, tone: "bg-yellow-100 text-yellow-800" },
  { initial: "C", name: "Coke 1.5L", sku: "KNJ-CKE-15", qty: 1, cents: 8500, tone: "bg-rose-100 text-rose-800" },
];

// 0 empty → 1–3 items tapped in → 4 Charge pressed → 5 receipt printing → 6 hold.
const STEP_MS = [1400, 1100, 1100, 1300, 900, 1700, 2600];
const FINAL_STEP = STEP_MS.length - 1;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

function peso(cents: number): string {
  return "₱" + (cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AuthRailDemo() {
  // Server snapshot is "motion", so SSR/first paint stay deterministic.
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % STEP_MS.length), STEP_MS[step]);
    return () => window.clearTimeout(t);
  }, [step, reduceMotion]);

  const shown = reduceMotion ? FINAL_STEP : step;
  const lines = ITEMS.slice(0, Math.min(shown, ITEMS.length));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.cents, 0);
  const vat = Math.round((total * 12) / 112);
  const charging = shown === 4;
  const printing = shown >= 5;

  return (
    <div
      aria-hidden="true"
      className="relative mt-6 aspect-[4/3] w-full max-w-[400px] overflow-hidden rounded-xl2 border border-white/15 bg-brand-700/40 shadow-2xl ring-1 ring-white/10 grid place-items-center p-3 sm:p-4"
    >
      <div className="w-full rounded-[14px] bg-surface text-ink shadow-xl p-2.5 sm:p-3">
        <div className="flex items-center gap-1.5">
          <BrandMark className="w-4 h-4" />
          <span className="text-[11px] font-extrabold tracking-tight">Register</span>
          <span className="text-[9.5px] text-ink-faint truncate">· Kape ni Juan</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-600">
            <span className="w-1 h-1 rounded-full bg-accent-500" />
            Cashier: Ana
          </span>
        </div>

        <div className="mt-2 grid grid-cols-[1.35fr_1fr] gap-2">
          {/* Catalog side: search + the order lines as they're tapped in. */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 rounded-[8px] hairline px-2 h-6 text-[9.5px] text-ink-faint">
              <Icon name="search" className="w-3 h-3" />
              Search by name or SKU…
            </div>
            <div className="mt-1.5 space-y-1 min-h-[86px]">
              {lines.length === 0 && (
                <p className="pt-6 text-center text-[9.5px] text-ink-faint">Tap a product to start an order.</p>
              )}
              {lines.map((l) => (
                <div key={l.name} className="step-in flex items-center gap-1.5 hairline-b pb-1">
                  <span className={"grid place-items-center w-5 h-5 rounded-[6px] text-[9px] font-extrabold " + l.tone}>
                    {l.initial}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="text-[10px] font-bold truncate">{l.name}</div>
                    <div className="text-[8px] text-ink-faint font-mono">{l.sku}</div>
                  </div>
                  <span className="text-[9px] text-ink-faint tabular-nums">×{l.qty}</span>
                  <span className="text-[10px] font-bold tabular-nums">{peso(l.cents)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order side: totals → Charge → the thermal receipt printing out. */}
          <div className="relative overflow-hidden rounded-[10px] bg-paper p-2 flex flex-col">
            <div
              className="flex flex-col flex-1 transition-opacity duration-300"
              style={{ opacity: printing ? 0 : 1 }}
            >
              <div className="text-[8.5px] font-bold tracking-widest text-ink-faint">ORDER</div>
              <div className="mt-1 flex justify-between text-[9.5px]">
                <span className="text-ink-soft">Items</span>
                <span className="font-bold tabular-nums">{count}</span>
              </div>
              <div className="flex justify-between text-[9.5px]">
                <span className="text-ink-soft">VAT (12% incl.)</span>
                <span className="font-bold tabular-nums">{peso(vat)}</span>
              </div>
              <div className="mt-1.5 text-[8.5px] text-ink-soft">Total</div>
              <div className="text-[17px] font-extrabold tracking-tight text-brand-600 tabular-nums leading-tight">
                {peso(total)}
              </div>
              <div
                className={
                  "mt-auto rounded-[8px] bg-brand-600 py-1.5 text-center text-[10px] font-bold text-white transition-transform duration-200 " +
                  (charging ? "scale-95 ring-4 ring-brand-200" : "")
                }
              >
                {total > 0 ? `Charge ${peso(total)}` : "Charge"}
              </div>
            </div>

            {/* Printer slot + receipt paper sliding out of it. */}
            <div
              className="absolute inset-0 flex flex-col items-center p-2 transition-opacity duration-300"
              style={{ opacity: printing ? 1 : 0 }}
            >
              <div className="flex items-center gap-1 text-[8.5px] font-bold text-ink-soft">
                <Icon name="printer" className="w-3 h-3" />
                {shown >= FINAL_STEP ? "Receipt printed" : "Printing receipt…"}
              </div>
              <div className="mt-1 h-1.5 w-[88%] rounded-full bg-ink-soft" />
              <div className="relative -mt-0.5 w-[78%] flex-1 overflow-hidden">
                <div
                  className="bg-white text-[7.5px] leading-[1.35] text-neutral-800 font-mono px-1.5 py-1 shadow-sm ease-out"
                  style={{
                    transform: printing ? "translateY(0)" : "translateY(-100%)",
                    transition: reduceMotion ? "none" : "transform 1.4s",
                  }}
                >
                  <div className="text-center font-bold">KAPE NI JUAN</div>
                  <div className="text-center">VAT REG TIN 000-000-000</div>
                  <div className="my-0.5 border-t border-dashed border-neutral-400" />
                  {ITEMS.map((l) => (
                    <div key={l.name} className="flex justify-between gap-1">
                      <span className="truncate">
                        {l.qty > 1 ? `${l.qty}x ` : ""}
                        {l.name}
                      </span>
                      <span>{(l.cents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="my-0.5 border-t border-dashed border-neutral-400" />
                  <div className="flex justify-between font-bold">
                    <span>TOTAL</span>
                    <span>{(total / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT 12%</span>
                    <span>{(vat / 100).toFixed(2)}</span>
                  </div>
                  <div className="mt-0.5 text-center">Thank you!</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-xl2 ring-1 ring-inset ring-white/10" />
    </div>
  );
}
