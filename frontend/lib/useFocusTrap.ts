"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal a11y for our hand-rolled dialogs (no dialog library). While `active`:
 *  - move focus into the dialog on open (the container itself, so we don't
 *    surprise the user by focusing a PIN digit),
 *  - trap Tab/Shift+Tab within the dialog,
 *  - mark every sibling of the dialog's ancestors `inert` + `aria-hidden` so the
 *    backdrop is unreachable by keyboard and hidden from assistive tech,
 *  - restore focus to the previously-focused element (the trigger) on close.
 *
 * Purely presentational — it wraps the existing auth flow without touching any
 * of its state or handlers. Escape-to-close is owned by the caller; this only
 * governs focus. Call once per dialog element (pass that element's ref).
 *
 * `key` is an optional re-run token: when several dialogs share one ref and swap
 * by some state (e.g. StoreSignIn's phase), pass that state so the trap rebinds
 * to the newly-mounted card instead of staying bound to the old one.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  key?: unknown,
) {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Inert the rest of the page: walk from the dialog up to <body>, and at each
    // level mark every sibling that doesn't contain the dialog as inert. Works
    // for both portaled (PinSwitcher) and in-tree (StoreSignIn) dialogs.
    const restorers: Array<() => void> = [];
    let el: HTMLElement | null = node;
    while (el && el !== document.body) {
      const parent: HTMLElement | null = el.parentElement;
      if (!parent) break;
      for (const sib of Array.from(parent.children)) {
        if (sib === el || !(sib instanceof HTMLElement)) continue;
        const hadInert = sib.hasAttribute("inert");
        const prevAria = sib.getAttribute("aria-hidden");
        sib.setAttribute("inert", "");
        sib.setAttribute("aria-hidden", "true");
        restorers.push(() => {
          if (!hadInert) sib.removeAttribute("inert");
          if (prevAria === null) sib.removeAttribute("aria-hidden");
          else sib.setAttribute("aria-hidden", prevAria);
        });
      }
      el = parent;
    }

    // Anchor focus inside the dialog without landing on an interactive control.
    const hadTabIndex = node.hasAttribute("tabindex");
    if (!hadTabIndex) node.setAttribute("tabindex", "-1");
    const raf = window.requestAnimationFrame(() => node.focus({ preventScroll: true }));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (f) => f.offsetParent !== null || f === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      restorers.forEach((restore) => restore());
      if (!hadTabIndex) node.removeAttribute("tabindex");
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [ref, active, key]);
}
