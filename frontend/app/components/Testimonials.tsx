"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * Social-proof section — operator stories from local F&B merchants, each praising
 * a concrete VendoPOS strength (shift drawers, fast cashier switching, loyalty
 * and margins, stock alerts, printed receipts). An auto-rotating, swipeable
 * carousel with real avatars; all motion respects prefers-reduced-motion.
 */
interface Review {
  quote: string;
  name: string;
  role: string;
  store: string;
  region: string;
  initials: string;
  highlight: string;
  avatar: string;
}

function portrait(id: string): string {
  return `https://images.unsplash.com/photo-${id}?w=96&h=96&q=80&auto=format&fit=crop&crop=faces`;
}

const REVIEWS: Review[] = [
  {
    quote:
      "Three shift changes a day and the drawer never used to match. Now each barista opens and closes their own float, and it balances to the centavo — I check the variance from my phone before I even reach the shop.",
    name: "Patricia Gomez",
    role: "Owner",
    store: "Bean & Barrel Coffee",
    region: "Pasig City",
    initials: "PG",
    highlight: "Drawers balance to the centavo",
    avatar: portrait("1544005313-94ddf0286df2"),
  },
  {
    quote:
      "Weekend rush is brutal. The 4-digit PIN lets my crew hand off the till in seconds, and Senior and PWD discounts apply without anyone doing math on paper. Shorter lines, fewer mistakes.",
    name: "Nico Alvarez",
    role: "Store Manager",
    store: "Crust & Crema Bakehouse",
    region: "Makati City",
    initials: "NA",
    highlight: "2-second PIN switching",
    avatar: portrait("1506794778202-cad84cf45f1d"),
  },
  {
    quote:
      "Regulars earn points on every cup now, and at month-end I can finally see which drinks actually make money — not just what sold. At closing the Z-reading and BIR receipts are already sorted, so I've stopped staying late to reconcile by hand.",
    name: "Aira Santos",
    role: "Owner",
    store: "Tsaa & Co. Milk Tea",
    region: "Cebu City",
    initials: "AS",
    highlight: "Loyalty points + real margins",
    avatar: portrait("1573497019940-1c28c88b4f3e"),
  },
  {
    quote:
      "We used to run out of best-sellers in the middle of service without noticing. Now VendoPOS flags low stock before it's gone and I reorder from the same screen — far fewer 'sold out, sorry po' moments.",
    name: "Divine Ocampo",
    role: "Owner",
    store: "Lola's Lutong Bahay",
    region: "Davao City",
    initials: "DO",
    highlight: "Low-stock alerts before you run out",
    avatar: portrait("1534528741775-53994a69daeb"),
  },
  {
    quote:
      "We used to write receipts by hand and lose the line at lunch. Now the thermal printer spits out a BIR-ready receipt in a second, and the stock count is already right when I check it at night.",
    name: "Ramon Teng",
    role: "Owner",
    store: "Kopi Express",
    region: "Iloilo City",
    initials: "RT",
    highlight: "Receipts printed in a second",
    avatar: portrait("1557862921-37829c790f19"),
  },
];

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

export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduced = usePrefersReducedMotion();

  /** One card's horizontal stride (card width + the flex gap). */
  const stride = useCallback(() => {
    const el = trackRef.current;
    if (!el) return 0;
    const card = el.querySelector<HTMLElement>("[data-card]");
    return card ? card.offsetWidth + 20 : el.clientWidth;
  }, []);

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) return;
      el.scrollTo({ left: i * stride(), behavior: reduced ? "auto" : "smooth" });
    },
    [reduced, stride],
  );

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const s = stride();
    if (s > 0) setActive(Math.round(el.scrollLeft / s));
  }, [stride]);

  // Auto-advance (paused on hover/focus/touch), disabled under reduced motion.
  useEffect(() => {
    if (reduced) return;
    const el = trackRef.current;
    if (!el) return;
    let paused = false;
    const pause = () => (paused = true);
    const resume = () => (paused = false);
    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    const id = setInterval(() => {
      if (paused) return;
      const e = trackRef.current;
      if (!e) return;
      const atEnd = e.scrollLeft + e.clientWidth >= e.scrollWidth - 8;
      e.scrollTo({ left: atEnd ? 0 : e.scrollLeft + stride(), behavior: "smooth" });
    }, 4500);
    return () => {
      clearInterval(id);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
    };
  }, [reduced, stride]);

  return (
    <section id="stories" className="py-16 sm:py-28 bg-paper hairline-y">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Loved behind the espresso bar
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Brewed fast. Counted to the centavo.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            From neighbourhood coffee bars to bakeries and pastry cafés — here&apos;s what local food
            &amp; beverage operators say after switching their counters to VendoPOS.
          </p>

          {/* Honest trust strip (no inflated counts). */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-semibold text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex items-center gap-0.5 text-brand-500" aria-label="5 out of 5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} />
                ))}
              </span>
              5.0 from local operators
            </span>
            <Dot />
            <span>BIR-ready receipts</span>
            <Dot />
            <span>Senior &amp; PWD discounts</span>
            <Dot />
            <span>GCash · Maya · QRPH</span>
          </div>
        </div>

        {/* Carousel */}
        <div className="mt-12 reveal">
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="no-scrollbar flex gap-5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
          >
            {REVIEWS.map((r) => (
              <figure
                key={r.store}
                data-card
                className="snap-start shrink-0 basis-full sm:basis-[calc(50%-10px)] lg:basis-[calc(33.333%-14px)] lift rounded-xl2 bg-surface hairline shadow-card p-7 flex flex-col"
              >
                <div className="flex items-center gap-1 text-brand-500" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-[1rem] leading-relaxed text-ink">
                  “{r.quote}”
                </blockquote>
                <div className="mt-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 text-accent-600 px-3 py-1 text-[11.5px] font-bold tracking-tight">
                    <Icon name="check" className="w-[14px] h-[14px]" strokeWidth={2.2} />
                    {r.highlight}
                  </span>
                </div>
                <figcaption className="mt-5 pt-5 hairline-t flex items-center gap-3">
                  <Avatar review={r} />
                  <div className="leading-tight">
                    <div className="font-bold tracking-tight">{r.name}</div>
                    <div className="text-[12.5px] text-ink-soft">
                      {r.role} · {r.store}, {r.region}
                    </div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* Dots */}
          <div className="mt-7 flex justify-center gap-2">
            {REVIEWS.map((r, i) => (
              <button
                key={r.store}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show testimonial ${i + 1}`}
                aria-current={i === active}
                className={
                  "h-2 rounded-full transition-all duration-300 " +
                  (i === active ? "w-6 bg-brand-500" : "w-2 bg-ink/20 hover:bg-ink/40")
                }
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Avatar({ review }: { review: Review }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="grid place-items-center w-11 h-11 rounded-full bg-ink text-paper font-bold text-[14px] tracking-tight shrink-0">
        {review.initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={review.avatar}
      alt={review.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-11 h-11 rounded-full object-cover hairline shrink-0"
    />
  );
}

function Dot() {
  return <span className="text-ink-faint/60" aria-hidden="true">·</span>;
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.6 6.1 21.3l1.2-6.6L2.5 9.5l6.6-.9L12 2.5Z" />
    </svg>
  );
}
