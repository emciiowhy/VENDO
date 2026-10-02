"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { media } from "@/lib/marketingMedia";

/**
 * The hero's live point-of-sale demo. A gentle 6-step loop "rings up" an order —
 * rows ease in one by one, the running total counts up, and the sale settles on
 * a highlighted e-wallet — so the panel reads as a real product in motion rather
 * than a flat screenshot. A floating "today" stat hints at the ERP breadth.
 *
 * Fully decorative: it starts on the completed state (so SSR / first paint and
 * reduced-motion users see a finished, intentional order) and only animates once
 * mounted. All motion is gated on prefers-reduced-motion.
 */

interface Product {
  name: string;
  price: string;
  mediaKey: string;
  fallbackIcon: IconName;
}

const PRODUCTS: Product[] = [
  { name: "Kapeng Barako", price: "₱120", mediaKey: "hero-coffee", fallbackIcon: "box" },
  { name: "Milk Tea", price: "₱140", mediaKey: "hero-milktea", fallbackIcon: "box" },
  { name: "Ensaymada", price: "₱85", mediaKey: "hero-ensaymada", fallbackIcon: "box" },
  { name: "Ube Cake", price: "₱160", mediaKey: "hero-ubecake", fallbackIcon: "box" },
];

const LINES = [
  { label: "Kapeng Barako ×2", amount: 240 },
  { label: "Ensaymada ×1", amount: 85 },
  { label: "Milk Tea ×1", amount: 140 },
];
const FINAL_TOTAL = LINES.reduce((a, l) => a + l.amount, 0); // 465

/** Smoothly tween a displayed integer toward `target` (eased, ~500ms). */
function useCountUp(target: number, enabled: boolean): number {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    if (!enabled) {
      prev.current = target;
      setVal(target);
      return;
    }
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 500);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);
  return val;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function Thumb({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const src = media(product.mediaKey);
  return (
    <div className="w-9 h-9 rounded-md overflow-hidden hairline bg-brand-50 grid place-items-center mb-2.5">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={product.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <Icon name={product.fallbackIcon} className="w-4 h-4 text-brand-600" strokeWidth={1.6} />
      )}
    </div>
  );
}

export function HeroPosDemo() {
  const reduced = usePrefersReducedMotion();
  // Start completed so the first paint is a finished order; loop once mounted.
  const [step, setStep] = useState(5);

  useEffect(() => {
    if (reduced) {
      setStep(5);
      return;
    }
    const id = setInterval(() => setStep((s) => (s + 1) % 6), 1250);
    return () => clearInterval(id);
  }, [reduced]);

  const visible = Math.min(step, LINES.length); // rows rung up so far
  const paid = step >= 4;
  const target = LINES.slice(0, visible).reduce((a, l) => a + l.amount, 0);
  const total = useCountUp(reduced ? FINAL_TOTAL : target, !reduced);
  const todayTotal = useCountUp(12480, !reduced);

  return (
    <div className="relative">
      <div className="lift rounded-xl2 bg-white hairline shadow-soft overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center gap-2 px-5 h-11 hairline-b bg-paper">
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="ml-auto text-[12px] font-semibold text-ink-faint tracking-wide">
            VendoPOS · Point of Sale
          </span>
        </div>

        <div className="grid grid-cols-[1.35fr_1fr]">
          {/* catalog */}
          <div className="p-4 grid grid-cols-2 gap-2.5 content-start hairline-r">
            {PRODUCTS.map((p) => (
              <div key={p.name} className="hairline rounded-lg p-3">
                <Thumb product={p} />
                <div className="text-[12.5px] font-bold text-ink leading-tight">{p.name}</div>
                <div className="text-[12px] text-ink-faint">{p.price}</div>
              </div>
            ))}
          </div>

          {/* order */}
          <div className="p-4 bg-paper flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                Current order
              </span>
              <span
                className={
                  "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent-700 bg-accent-50 rounded-full px-2 py-0.5 transition-opacity duration-300 " +
                  (paid ? "opacity-100" : "opacity-0")
                }
              >
                <Icon name="check" className="w-3 h-3" strokeWidth={2.4} />
                Paid
              </span>
            </div>

            <div className="min-h-[108px]">
              {LINES.map((l, i) => {
                const shown = i < visible;
                return (
                  <div
                    key={l.label}
                    className={
                      "vp-hero-line flex justify-between text-[12.5px] py-2 " +
                      (shown
                        ? "opacity-100 translate-x-0 hairline-b"
                        : "opacity-0 translate-x-3 pointer-events-none")
                    }
                  >
                    <span className="text-ink-soft">{l.label}</span>
                    <span className="font-semibold tabular-nums">₱{l.amount}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-auto pt-3">
              <div className="flex justify-between items-baseline">
                <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide">
                  Total
                </span>
                <span className="text-[1.4rem] font-extrabold tracking-tight tabular-nums">
                  ₱{total.toLocaleString("en-PH")}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(["GCash", "Maya", "QRPH"] as const).map((m) => {
                  const active = paid && m === "Maya";
                  return (
                    <span
                      key={m}
                      className={
                        "text-[11px] font-bold text-accent-600 bg-accent-50 rounded-md py-1.5 text-center transition-all duration-300 " +
                        (active ? "ring-2 ring-accent-500/60 scale-[1.03] shadow-sm" : "")
                      }
                    >
                      {m}
                    </span>
                  );
                })}
                <span className="text-[11px] font-bold text-ink-soft bg-white hairline rounded-md py-1.5 text-center">
                  Cash
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating "today" stat — hints at the ERP breadth beyond the till */}
      <div className="vp-hero-float absolute -bottom-5 -left-4 hidden sm:flex items-center gap-3 rounded-xl2 bg-white hairline shadow-soft px-4 py-3">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-accent-50 text-accent-600">
          <Icon name="trend" className="w-[18px] h-[18px]" strokeWidth={1.8} />
        </span>
        <div>
          <div className="text-[11px] font-semibold text-ink-faint uppercase tracking-wide">
            Sales today
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[1.05rem] font-extrabold tracking-tight tabular-nums text-ink">
              ₱{todayTotal.toLocaleString("en-PH")}
            </span>
            <span className="text-[11px] font-bold text-accent-600">▲ 18%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
