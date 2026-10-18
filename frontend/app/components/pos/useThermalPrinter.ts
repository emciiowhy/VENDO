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
const KIND_STORAGE_KEY = "vendopos_printer_kind";

/** The rail the cashier last connected, so a refresh re-adopts that one first. */
function lastKind(): PrinterKind {
  try {
    return window.localStorage.getItem(KIND_STORAGE_KEY) === "bluetooth" ? "bluetooth" : "usb";
  } catch {
    return "usb";
  }
}

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
  /** Bumped on every manual connect/disconnect so a slow silent probe knows it lost. */
  const generationRef = useRef(0);
  /** Tail of the print queue — writes run one at a time (see {@link print}). */
  const printQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  /** Wire a freshly-opened printer into state + the disconnect listener. */
  const adopt = useCallback((printer: ThermalPrinter) => {
    printer.onDisconnect(() => {
      // Ignore drops from a handle we've already replaced — e.g. closing the old
      // Bluetooth unit fires gattserverdisconnected after we've moved to USB.
      if (printerRef.current !== printer) return;
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
    // so a page refresh mid-shift doesn't force a re-pair. Best-effort: the rail
    // used last goes first, then the other. Guarded by `cancelled` (unmount) and
    // the generation counter — a Bluetooth reconnect can take seconds, and if
    // the cashier connected a printer by hand meanwhile, theirs wins.
    let cancelled = false;
    const generation = generationRef.current;
    (async () => {
      const probes =
        lastKind() === "bluetooth"
          ? [getGrantedBluetoothPrinter, getGrantedUsbPrinter]
          : [getGrantedUsbPrinter, getGrantedBluetoothPrinter];
      let printer: ThermalPrinter | null = null;
      for (const probe of probes) {
        if (cancelled || generationRef.current !== generation) return;
        printer = await probe();
        if (printer) break;
      }
      if (!printer) return;
      if (cancelled || generationRef.current !== generation) {
        // Don't close a unit the manual connect is now using — same device
        // object means closing ours would drop theirs too.
        if (printerRef.current?.device !== printer.device) void printer.close();
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
      const generation = ++generationRef.current;
      setStatus("connecting");
      setError(null);
      try {
        // Detach before closing so the old handle's disconnect event is ignored.
        const previous = printerRef.current;
        printerRef.current = null;
        await previous?.close().catch(() => {});
        const printer = kind === "usb" ? await connectUsbPrinter() : await connectBluetoothPrinter();
        if (generationRef.current !== generation) {
          // A newer connect/disconnect superseded this one while the chooser was open.
          void printer.close();
          return false;
        }
        try {
          window.localStorage.setItem(KIND_STORAGE_KEY, kind);
        } catch {
          /* ignore */
        }
        adopt(printer);
        return true;
      } catch (e) {
        if (generationRef.current !== generation) return false;
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
    generationRef.current++;
    const previous = printerRef.current;
    printerRef.current = null;
    await previous?.close().catch(() => {});
    setStatus("disconnected");
    setDeviceName(null);
    setError(null);
  }, []);

  // Writes are queued: auto-print on settlement and a reprint/test print can
  // land together, and interleaved chunks garble the ticket (USB) or fail with
  // "GATT operation already in progress" (Bluetooth).
  const print = useCallback((bytes: Uint8Array): Promise<boolean> => {
    const job = printQueueRef.current.then(async (): Promise<boolean> => {
      const printer = printerRef.current;
      if (!printer || !printer.isConnected()) {
        setError("No thermal printer connected.");
        return false;
      }
      try {
        await printer.write(bytes);
        setError(null);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Print failed.");
        if (!printer.isConnected() && printerRef.current === printer) {
          printerRef.current = null;
          setStatus("disconnected");
          setDeviceName(null);
        }
        return false;
      }
    });
    printQueueRef.current = job;
    return job;
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
