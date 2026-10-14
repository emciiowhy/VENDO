"use client";

import { useEffect, useState } from "react";

/**
 * The product-in-motion highlight that sits in the brand rail of /login and
 * /signup, between the value-prop list and the support blurb.
 *
 * It autoplays a muted, looping clip of the register ringing up a sale. When
 * the OS asks for reduced motion we render the poster still instead of the
 * video — so the panel never animates against the user's preference, and we
 * sidestep this project's recurring "animations look frozen on localhost"
 * confusion (that's usually Windows "Show animations" off → reduced motion).
 *
 * The frame reserves its 4:3 aspect ratio up front so the rail never shifts as
 * the clip loads, and it's decorative (aria-hidden) so it never traps focus.
 */
export function AuthRailVideo() {
  // Default to motion; swap to the still only once we know the preference,
  // which keeps SSR/first paint deterministic.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="relative mt-6 aspect-[4/3] w-full max-w-[340px] overflow-hidden rounded-xl2 border border-white/15 bg-brand-700/40 shadow-xl ring-1 ring-white/10"
    >
      {reduceMotion ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/media/auth-highlight-poster.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        <video
          className="h-full w-full object-cover"
          poster="/media/auth-highlight-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src="/media/auth-highlight.mp4" type="video/mp4" />
        </video>
      )}
      {/* Subtle inner edge so the clip reads as framed glass, on-brand. */}
      <div className="pointer-events-none absolute inset-0 rounded-xl2 ring-1 ring-inset ring-white/10" />
    </div>
  );
}
