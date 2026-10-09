"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectBluetoothPrinter,
  connectUsbPrinter,
  getGrantedBluetoothPrinter,
  getGrantedUsbPrinter,
  isWebBluetoothSupported,
  isWebUsbSupported,
  type PrinterKind,
  type ThermalPrinter,
} from "@/lib/thermalPrinter";

export type ThermalStatus = "disconnected" | "connecting" | "connected" | "error";

/** Paper size → printable column count fed to the ESC/POS builder. */
export type PaperSize = "58mm" | "80mm";
export const PAPER_WIDTH: Record<PaperSize, number> = { "58mm": 32, "80mm": 48 };
const PAPER_STORAGE_KEY = "vendopos_printer_paper";

export interface ThermalSupport {
  usb: boolean;
  bluetooth: boolean;
  any: boolean;
}

export interface UseThermalPrinter {
  support: ThermalSupport;
  status: ThermalStatus;
  deviceName: string | null;
  error: string | null;
  /** Selected paper size; persisted so it survives reloads. */
  paper: PaperSize;
  /** Printable column count for {@link paper} (32 or 48) — pass to buildSaleReceipt. */
  width: number;
  setPaper: (paper: PaperSize) => void;
  connect: (kind: PrinterKind) => Promise<boolean>;
  disconnect: () => Promise<void>;
  print: (bytes: Uint8Array) => Promise<boolean>;
}

function initialPaper(): PaperSize {
  if (typeof window === "undefined") return "58mm";
  try {
    const stored = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (stored === "58mm" || stored === "80mm") return stored;
  } catch {
    /* private mode / disabled storage */
  }
  return "58mm"; // safe everywhere — 58mm columns fit an 80mm head too
}

/**
 * Register-side controller for a thermal printer connection. The live device is
 * held in a ref (it's a connection handle, not render data); only the derived
 * status/name/error are state.
 *
 * SSR-safety: capability flags start `false` on the server and the first client
 * render — `navigator.usb` / `navigator.bluetooth` are read only inside the
 * mount effect, never in a state initializer — so the terminal hydrates
 * identically on both sides and reconciles real support after mount. The paper
 * size starts at the deterministic "58mm" default for the same reason, then
 * reconciles to the stored choice in the same effect.
 */
export function useThermalPrinter(): UseThermalPrinter {
  const [support, setSupport] = useState<ThermalSupport>({ usb: false, bluetooth: false, any: false });
  const [status, setStatus] = useState<ThermalStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaperState] = useState<PaperSize>("58mm");
  const printerRef = useRef<ThermalPrinter | null>(null);

  /** Wire a freshly-opened printer into state + the disconnect listener. */
  const adopt = useCallback((printer: ThermalPrinter) => {
    printer.onDisconnect(() => {
      printerRef.current = null;
      setStatus("disconnected");
      setDeviceName(null);
    });
    printerRef.current = printer;
    setDeviceName(printer.name);
    setStatus("connected");
  }, []);

  useEffect(() => {
    const usb = isWebUsbSupported();
    const bluetooth = isWebBluetoothSupported();
    // Capability + paper are client-only and must start at their SSR defaults to
    // hydrate identically, then reconcile here after mount (see header).
    setSupport({ usb, bluetooth, any: usb || bluetooth });
    setPaperState(initialPaper());

    // Silently re-adopt a printer the user already granted in a prior session,
    // so a page refresh mid-shift doesn't force a re-pair. Best-effort: USB
    // first (reconnect is reliable), then Bluetooth. Guarded by `cancelled` in
    // case the terminal unmounts before the async probe resolves.
    let cancelled = false;
    (async () => {
      const printer = (await getGrantedUsbPrinter()) ?? (await getGrantedBluetoothPrinter());
      if (!printer) return;
      if (cancelled) {
        void printer.close();
        return;
      }
      adopt(printer);
    })();

    return () => {
      cancelled = true;
      void printerRef.current?.close();
      printerRef.current = null;
    };
  }, [adopt]);

  const setPaper = useCallback((next: PaperSize) => {
    try {
      window.localStorage.setItem(PAPER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    setPaperState(next);
  }, []);

  const connect = useCallback(
    async (kind: PrinterKind): Promise<boolean> => {
      setStatus("connecting");
      setError(null);
      try {
        await printerRef.current?.close().catch(() => {});
        const printer = kind === "usb" ? await connectUsbPrinter() : await connectBluetoothPrinter();
        adopt(printer);
        return true;
      } catch (e) {
        printerRef.current = null;
        const msg = e instanceof Error ? e.message : "Couldn’t connect to the printer.";
        // Dismissing the device chooser rejects with NotFoundError — treat as a
        // quiet cancel, not an error state.
        const cancelled = /no device selected|cancel|user gesture/i.test(msg);
        setDeviceName(null);
        setStatus(cancelled ? "disconnected" : "error");
        setError(cancelled ? null : msg);
        return false;
      }
    },
    [adopt],
  );

  const disconnect = useCallback(async (): Promise<void> => {
    await printerRef.current?.close().catch(() => {});
    printerRef.current = null;
    setStatus("disconnected");
    setDeviceName(null);
    setError(null);
  }, []);

  const print = useCallback(async (bytes: Uint8Array): Promise<boolean> => {
    const printer = printerRef.current;
    if (!printer || !printer.isConnected()) {
      setError("No thermal printer connected.");
      return false;
    }
    try {
      await printer.write(bytes);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed.");
      if (!printer.isConnected()) {
        printerRef.current = null;
        setStatus("disconnected");
        setDeviceName(null);
      }
      return false;
    }
  }, []);

  return {
    support,
    status,
    deviceName,
    error,
    paper,
    width: PAPER_WIDTH[paper],
    setPaper,
    connect,
    disconnect,
    print,
  };
}
