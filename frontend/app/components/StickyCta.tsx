"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Mobile-only sticky CTA. The desktop nav keeps a persistent "Request a Demo"
 * button, but on phones that button scrolls away — so once the hero is out of
 * view we slide a bottom bar up. Observes the hero section (the first
 * `<section>` in `<main>`) instead of a hard scroll threshold, mirroring the
 * ScrollReveal IntersectionObserver pattern. Hidden entirely at `lg`.
 *
 * It also retracts once the footer enters view: the footer has its own "Request
 * a Demo" link, so keeping the floating bar there is both redundant and would
 * overlap the last footer links (Legal). So show = hero gone AND footer not yet
 * visible.
 */
export function StickyCta() {
  const [heroGone, setHeroGone] = useState(false);
  const [footerIn, setFooterIn] = useState(false);
  const show = heroGone && !footerIn;

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const observers: IntersectionObserver[] = [];

    const hero = document.querySelector("main > section");
    if (hero) {
      const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting), {
        rootMargin: "-45% 0px 0px 0px",
      });
      io.observe(hero);
      observers.push(io);
    }

    const footer = document.querySelector("footer");
    if (footer) {
      // Retract a little before the footer fully lands so the bar never clips
      // the footer's top content on the way in.
      const io = new IntersectionObserver(([e]) => setFooterIn(e.isIntersecting), {
        rootMargin: "0px 0px -10% 0px",
      });
      io.observe(footer);
      observers.push(io);
    }

    return () => observers.forEach((io) => io.disconnect());
  }, []);

  return (
    <div
      className={
        "lg:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] " +
        "bg-paper/95 backdrop-blur hairline-t transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none " +
        (show ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none")
      }
    >
      <a
        href="#demo"
        className="press flex items-center justify-center gap-2 w-full bg-brand-600 text-white font-semibold text-[15px] py-3.5 rounded-[11px] shadow-btn"
      >
        Request a Demo
        <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </a>
    </div>
  );
}
