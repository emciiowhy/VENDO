"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectBluetoothPrinter,
  connectUsbPrinter,
  isWebBluetoothSupported,
  isWebUsbSupported,
  type PrinterKind,
  type ThermalPrinter,
} from "@/lib/thermalPrinter";

export type ThermalStatus = "disconnected" | "connecting" | "connected" | "error";

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
  connect: (kind: PrinterKind) => Promise<boolean>;
  disconnect: () => Promise<void>;
  print: (bytes: Uint8Array) => Promise<boolean>;
}

/**
 * Register-side controller for a thermal printer connection. The live device is
 * held in a ref (it's a connection handle, not render data); only the derived
 * status/name/error are state.
 *
 * SSR-safety: capability flags start `false` on the server and the first client
 * render — `navigator.usb` / `navigator.bluetooth` are read only inside the
 * mount effect, never in a state initializer — so the terminal hydrates
 * identically on both sides and reconciles real support after mount.
 */
export function useThermalPrinter(): UseThermalPrinter {
  const [support, setSupport] = useState<ThermalSupport>({ usb: false, bluetooth: false, any: false });
  const [status, setStatus] = useState<ThermalStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printerRef = useRef<ThermalPrinter | null>(null);

  useEffect(() => {
    const usb = isWebUsbSupported();
    const bluetooth = isWebBluetoothSupported();
    setSupport({ usb, bluetooth, any: usb || bluetooth });
    // Drop the link if the terminal unmounts.
    return () => {
      void printerRef.current?.close();
      printerRef.current = null;
    };
  }, []);

  const connect = useCallback(async (kind: PrinterKind): Promise<boolean> => {
    setStatus("connecting");
    setError(null);
    try {
      await printerRef.current?.close().catch(() => {});
      const printer = kind === "usb" ? await connectUsbPrinter() : await connectBluetoothPrinter();
      printer.onDisconnect(() => {
        printerRef.current = null;
        setStatus("disconnected");
        setDeviceName(null);
      });
      printerRef.current = printer;
      setDeviceName(printer.name);
      setStatus("connected");
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
  }, []);

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

  return { support, status, deviceName, error, connect, disconnect, print };
}
