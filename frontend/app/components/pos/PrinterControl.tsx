"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { buildTestReceipt } from "@/lib/escpos";
import type { StoreBrand } from "@/lib/pos";
import type { PaperSize, UseThermalPrinter } from "./useThermalPrinter";

/**
 * Header-level printer control: pair a thermal unit ONCE at shift start (not
 * mid-sale), fire a Test print to proof width/alignment, pick 58mm/80mm paper,
 * and see live connection status. Renders nothing when the browser exposes no
 * printing transport, so non-Chromium runtimes see a clean header.
 *
 * The connection itself lives in the shared {@link UseThermalPrinter} hook owned
 * by the terminal, so a printer paired here is the same one that auto-prints on
 * settlement and reprints from the receipt modal.
 */
export function PrinterControl({
  thermal,
  store,
}: {
  thermal: UseThermalPrinter;
  store: StoreBrand;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc — same affordance as the notification bell.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!thermal.support.any) return null;

  const connected = thermal.status === "connected";
  const dot = connected ? "bg-accent-500" : thermal.status === "error" ? "bg-rose-500" : "bg-ink-faint";

  const testPrint = () => void thermal.print(buildTestReceipt(store, thermal.width));

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={connected ? `Printer · ${thermal.deviceName}` : "Thermal printer"}
        aria-label="Thermal printer"
        aria-expanded={open}
        className="tap press inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200"
      >
        <span className="relative inline-flex">
          <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          <span className={"absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full " + dot} />
        </span>
        <span className="hidden lg:inline">{connected ? "Printer" : "Connect printer"}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[264px] rounded-xl2 bg-surface hairline shadow-soft p-3 z-[120] text-left">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-bold text-ink">Thermal printer</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
              <span className={"w-1.5 h-1.5 rounded-full " + dot} />
              {connected ? "Connected" : thermal.status === "connecting" ? "Connecting…" : "Not connected"}
            </span>
          </div>

          {/* Paper width — proof with a Test print before the first sale. */}
          <div className="mt-3">
            <span className="text-[11px] font-semibold text-ink-faint">Paper width</span>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-[10px] bg-paper hairline p-1">
              {(["58mm", "80mm"] as PaperSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => thermal.setPaper(size)}
                  aria-pressed={thermal.paper === size}
                  className={
                    "rounded-[7px] py-1.5 text-[12.5px] font-semibold transition-colors duration-150 " +
                    (thermal.paper === size
                      ? "bg-surface text-brand-600 shadow-card"
                      : "text-ink-soft hover:text-ink")
                  }
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 hairline-t pt-3">
            {connected ? (
              <>
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-accent-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                  <span className="truncate">{thermal.deviceName}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={testPrint}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-paper hairline px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150"
                  >
                    <Icon name="receipt" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                    Test print
                  </button>
                  <button
                    type="button"
                    onClick={() => void thermal.disconnect()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-paper hairline px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-rose-600 transition duration-150"
                  >
                    <Icon name="x" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-[11px] font-semibold text-ink-faint">Connect a printer</span>
                <div className="mt-1.5 flex items-center gap-2">
                  {thermal.support.usb && (
                    <button
                      type="button"
                      onClick={() => void thermal.connect("usb")}
                      disabled={thermal.status === "connecting"}
                      className="flex-1 rounded-[8px] bg-paper hairline px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150 disabled:opacity-50"
                    >
                      USB
                    </button>
                  )}
                  {thermal.support.bluetooth && (
                    <button
                      type="button"
                      onClick={() => void thermal.connect("bluetooth")}
                      disabled={thermal.status === "connecting"}
                      className="flex-1 rounded-[8px] bg-paper hairline px-3 py-2 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150 disabled:opacity-50"
                    >
                      Bluetooth
                    </button>
                  )}
                </div>
              </>
            )}
            {thermal.error && <p className="mt-2 text-[12px] font-semibold text-rose-600">{thermal.error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
