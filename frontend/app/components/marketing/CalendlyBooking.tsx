"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "../Icon";
import { ENTERPRISE_BOOKING_URL } from "@/lib/api";

/**
 * The in-app Enterprise booking page (/enterprise/book). Rather than bouncing the
 * prospect out to a Calendly tab, we host the scheduler inside our own chrome and
 * embed Calendly's inline widget here.
 *
 * The prospect arrives here from the Enterprise concierge CTAs — and after a
 * successful intake submit, with their name/email carried in the query string so
 * we can prefill the Calendly form and save them re-typing it.
 *
 * Calendly's embed.js is loaded on demand (no precedent for a global third-party
 * script in this app, so we keep it self-contained and only pay for it on this
 * route). Once ready we initialise the inline widget with the prefill.
 */

const CALENDLY_CSS = "https://assets.calendly.com/assets/external/widget.css";
const CALENDLY_JS = "https://assets.calendly.com/assets/external/widget.js";

type CalendlyGlobal = {
  initInlineWidget: (opts: {
    url: string;
    parentElement: HTMLElement;
    prefill?: { name?: string; email?: string };
  }) => void;
};

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Calendly failed to load")));
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.addEventListener("load", () => {
      el.dataset.loaded = "true";
      resolve();
    });
    el.addEventListener("error", () => reject(new Error("Calendly failed to load")));
    document.head.appendChild(el);
  });
}

function ensureStylesheet(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export function CalendlyBooking() {
  const params = useSearchParams();
  const name = params.get("name")?.trim() || undefined;
  const email = params.get("email")?.trim() || undefined;

  const widgetRef = useRef<HTMLDivElement>(null);
  const initialised = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureStylesheet(CALENDLY_CSS);
    loadScriptOnce(CALENDLY_JS)
      .then(() => {
        if (cancelled || initialised.current || !widgetRef.current) return;
        // The target div is deliberately NOT given the `calendly-inline-widget`
        // class: widget.js auto-initialises any such element by reading its
        // `data-url` on load, and with no data-url it throws before assigning
        // window.Calendly. We init manually via parentElement instead.
        const calendly = (window as unknown as { Calendly?: CalendlyGlobal }).Calendly;
        if (!calendly) {
          setFailed(true);
          return;
        }
        initialised.current = true;
        calendly.initInlineWidget({
          url: ENTERPRISE_BOOKING_URL,
          parentElement: widgetRef.current,
          prefill: name || email ? { name, email } : undefined,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [name, email]);

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="max-w-[62ch]">
          <Link
            href="/enterprise"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-brand-600 transition"
          >
            <Icon name="arrow" className="w-[15px] h-[15px] rotate-180" strokeWidth={1.9} />
            Back to Enterprise concierge
          </Link>
          <span className="mt-6 block text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Enterprise concierge
          </span>
          <h1 className="mt-3 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.08] tracking-tightest font-extrabold">
            Book your 1-on-1 Zoom consultation
          </h1>
          <p className="mt-4 text-[1.02rem] text-ink-soft leading-relaxed">
            Pick a time that suits you. A VendoPOS solutions lead will walk through your operation,
            locations and goals — and answer everything before you commit.
          </p>
        </div>

        <div className="mt-10 rounded-[20px] bg-surface hairline shadow-soft overflow-hidden">
          {failed ? (
            <div className="px-7 sm:px-8 py-16 text-center">
              <h2 className="text-[1.2rem] font-extrabold tracking-tight">
                Scheduler couldn&apos;t load
              </h2>
              <p className="mt-2 text-ink-soft max-w-[44ch] mx-auto leading-relaxed text-[14px]">
                It may be a connection hiccup or an ad blocker. You can open the scheduler directly
                in a new tab instead.
              </p>
              <a
                href={ENTERPRISE_BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-[11px] bg-brand-500 hover:bg-brand-600 px-5 py-3 text-[14px] font-semibold text-white shadow-btn tracking-tight transition"
              >
                <Icon name="monitor" className="w-[17px] h-[17px]" strokeWidth={1.9} />
                Open Calendly
              </a>
            </div>
          ) : (
            <div
              ref={widgetRef}
              style={{ minWidth: "320px", height: "720px" }}
              aria-label="Calendly scheduling widget"
            />
          )}
        </div>
      </div>
    </section>
  );
}
