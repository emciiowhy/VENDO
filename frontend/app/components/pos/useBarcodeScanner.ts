"use client";

import { useEffect, useRef } from "react";

export interface BarcodeScannerOptions {
  /** Called with the decoded payload when a scan burst is recognised. */
  onScan: (code: string) => void;
  /** Master switch — disable while a modal owns the keyboard, etc. */
  enabled?: boolean;
  /** Shortest key sequence treated as a scan (guards against stray keys). */
  minLength?: number;
  /** Max gap (ms) between keys for them to count as one scanner burst. */
  maxIntervalMs?: number;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Global keyboard-wedge barcode capture. A hardware laser/QR scanner emulates a
 * keyboard, typing the payload as a rapid burst terminated by Enter. This hook
 * listens at the window, tells that burst from human typing by the inter-key
 * interval, and fires `onScan` with the decoded payload.
 *
 * It intentionally ignores keystrokes while an editable element is focused — the
 * register's own "Search or scan" box handles those — so this only adds the
 * "scan anywhere on the terminal" path without double-adding. While a fast burst
 * is in flight (and nothing is focused) it `preventDefault`s the keys so a stray
 * character can't trigger a shortcut or scroll the page (the focus-shift bugs
 * the brief calls out). No globals are read during render, so it's SSR-safe.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxIntervalMs = 50,
}: BarcodeScannerOptions): void {
  // Hold the latest callback in a ref so changing it doesn't re-bind the listener.
  // Synced in an effect (not during render) so we never write a ref while rendering.
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let buffer = "";
    let lastTime = 0;

    const reset = () => {
      buffer = "";
      lastTime = 0;
    };

    function onKeyDown(e: KeyboardEvent) {
      // Leave typing in fields and modifier combos untouched.
      if (isEditableTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) {
        reset();
        return;
      }
      const now = Date.now();
      const fast = now - lastTime <= maxIntervalMs;

      if (e.key === "Enter") {
        if (buffer.length >= minLength && fast) {
          const code = buffer;
          reset();
          e.preventDefault();
          onScanRef.current(code);
        } else {
          reset();
        }
        return;
      }

      // Only printable single characters belong to a barcode payload.
      if (e.key.length !== 1) {
        reset();
        return;
      }
      if (!fast) buffer = ""; // a slow keystroke starts a fresh candidate
      buffer += e.key;
      lastTime = now;
      // Once a burst is established, swallow the character so it can't scroll or
      // fire a shortcut while we accumulate the rest of the code.
      if (buffer.length >= 2) e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, minLength, maxIntervalMs]);
}
