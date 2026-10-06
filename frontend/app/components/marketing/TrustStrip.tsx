"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/app/components/Icon";

/**
 * Platform-level proof strip (BIR / e-wallets / Senior-PWD / peso) shared across
 * the marketing detail pages. Kept separate from page-specific content so it
 * never overlaps or repeats a page's own feature claims.
 *
 * Each proof renders as a white chip with an icon badge. The strip reveals with
 * a staggered rise the first time it scrolls into view, then each chip lifts on
 * hover (pointer devices). Motion is token-driven and GPU-only; the entrance is
 * disabled and chips shown immediately under prefers-reduced-motion.
 */
const TRUST: { icon: IconName; label: string }[] = [
  { icon: "receipt", label: "BIR-ready receipts" },
  { icon: "card", label: "GCash · Maya · QRPH" },
  { icon: "tag", label: "Senior & PWD discounts" },
  { icon: "peso", label: "Peso-first" },
];

export function TrustStrip() {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} className="bg-paper hairline-b">
      <div className="max-w-[1160px] mx-auto px-6 py-8 flex flex-wrap items-center justify-center gap-3">
        {TRUST.map((t, i) => (
          <div
            key={t.label}
            style={{ animationDelay: `${i * 80}ms` }}
            className={[
              "trust-chip group flex items-center gap-3 rounded-full",
              "bg-surface hairline pl-2 pr-5 py-2",
              "transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "hover:-translate-y-0.5 hover:shadow-card hover:border-brand-200",
              shown ? "is-in" : "",
            ].join(" ")}
          >
            <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-50 text-brand-600 transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:bg-brand-100 group-hover:scale-105 motion-reduce:transition-none motion-reduce:transform-none">
              <Icon name={t.icon} className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </span>
            <span className="text-[14px] font-semibold text-ink whitespace-nowrap">{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
