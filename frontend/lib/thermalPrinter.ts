/**
 * Transport adapters for direct-to-device thermal printing. Two physical rails
 * are supported behind one {@link ThermalPrinter} handle:
 *   • USB / desk-tethered units  → WebUSB (`navigator.usb`)
 *   • Mobile / Bluetooth units    → Web Bluetooth (`navigator.bluetooth`)
 *
 * The byte stream is authored elsewhere (`lib/escpos.ts`); this layer only opens
 * a connection and pushes bytes. Every entry point feature-detects its API and
 * throws a friendly Error when the browser lacks support, so a non-Chromium
 * runtime (or SSR) never crashes — callers surface the message and fall back to
 * the HTML receipt. No `navigator` access happens at module load, only inside
 * these functions, so importing this module is safe on the server.
 */

export type PrinterKind = "usb" | "bluetooth";

export interface ThermalPrinter {
  readonly kind: PrinterKind;
  /** Human-readable device label for the UI ("EPSON TM-T20", "BlueTooth Printer"). */
  readonly name: string;
  /**
   * The underlying USBDevice / BluetoothDevice. The browser hands back the same
   * object for the same physical unit, so this tells whether two handles share
   * one printer (closing either would drop both).
   */
  readonly device: object;
  /** Push an ESC/POS byte stream to the head. Rejects if the link dropped. */
  write(data: Uint8Array): Promise<void>;
  /** Tear down the connection (best-effort). */
  close(): Promise<void>;
  /** Whether the link is currently live. */
  isConnected(): boolean;
  /** Register a callback for an unexpected disconnect (e.g. unit powered off). */
  onDisconnect(cb: () => void): void;
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

/** True when at least one printing transport exists in this browser. */
export function isThermalPrintingSupported(): boolean {
  return isWebUsbSupported() || isWebBluetoothSupported();
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── WebUSB ──────────────────────────────────────────────────────────────────

function findBulkOutEndpoint(
  device: USBDevice,
): { interfaceNumber: number; endpointNumber: number } | null {
  const config = device.configuration;
  if (!config) return null;
  for (const iface of config.interfaces) {
    for (const ep of iface.alternate.endpoints) {
      if (ep.direction === "out") {
        return { interfaceNumber: iface.interfaceNumber, endpointNumber: ep.endpointNumber };
      }
    }
  }
  return null;
}

/**
 * Open a writable bulk pipe to an already-chosen USB device and wrap it as a
 * {@link ThermalPrinter}. Shared by the chooser path ({@link connectUsbPrinter})
 * and the silent reconnect path ({@link getGrantedUsbPrinter}).
 */
async function openUsbPrinter(device: USBDevice): Promise<ThermalPrinter> {
  let endpoint: { interfaceNumber: number; endpointNumber: number } | null;
  try {
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    endpoint = findBulkOutEndpoint(device);
    if (!endpoint) throw new Error("That device has no printable USB interface.");
    await device.claimInterface(endpoint.interfaceNumber);
  } catch (e) {
    // Never leave a half-opened device behind — a later open/claim (or the other
    // rail's silent probe) would trip over it.
    await device.close().catch(() => {});
    const msg = e instanceof Error ? e.message : "";
    // On Windows the OS print driver usually owns the interface, so the browser
    // gets "Access denied" / "Unable to claim interface".
    if (/access denied|unable to claim|claim interface/i.test(msg)) {
      throw new Error(
        "This USB printer is in use by your computer’s printer driver. Switch it to the WinUSB driver, or connect over Bluetooth.",
      );
    }
    throw e;
  }
  const ep = endpoint;

  let connected = true;
  const disconnectCbs: Array<() => void> = [];
  // WebUSB raises unplug events on navigator.usb, not on the device itself.
  const onUsbDisconnect = (e: USBConnectionEvent) => {
    if (e.device !== device || !connected) return;
    connected = false;
    navigator.usb?.removeEventListener("disconnect", onUsbDisconnect);
    for (const cb of disconnectCbs) cb();
  };
  navigator.usb?.addEventListener("disconnect", onUsbDisconnect);

  return {
    kind: "usb",
    name: device.productName || device.manufacturerName || "USB printer",
    device,
    isConnected: () => connected && device.opened,
    async write(data: Uint8Array) {
      if (!connected || !device.opened) throw new Error("USB printer is disconnected.");
      // Chunk the stream so a large ticket doesn't overflow a single transfer.
      const CHUNK = 4096;
      for (let i = 0; i < data.length; i += CHUNK) {
        await device.transferOut(ep.endpointNumber, data.subarray(i, i + CHUNK));
      }
    },
    async close() {
      connected = false;
      navigator.usb?.removeEventListener("disconnect", onUsbDisconnect);
      await device.close().catch(() => {});
    },
    onDisconnect(cb: () => void) {
      disconnectCbs.push(cb);
    },
  };
}

/**
 * Prompt the user to pick a USB printer and open a writable bulk pipe to it.
 * Must be called from a user gesture (browsers gate the chooser on one).
 */
export async function connectUsbPrinter(): Promise<ThermalPrinter> {
  if (!isWebUsbSupported()) {
    throw new Error("USB printing isn’t supported in this browser. Try Chrome or Edge.");
  }
  // Empty filter list lets the user pick any device — thermal heads enumerate
  // under varied classes (printer class 7, or vendor-specific), so we don't
  // pre-filter and hide a perfectly good unit.
  const device = await navigator.usb!.requestDevice({ filters: [] });
  return openUsbPrinter(device);
}

/**
 * Silently reopen a USB printer the user already granted in a prior session —
 * no chooser, no user gesture. `getDevices()` returns only devices this origin
 * was previously permitted to use. Returns null when none can be opened, so the
 * caller can fall back to the HTML receipt without surfacing an error.
 */
export async function getGrantedUsbPrinter(): Promise<ThermalPrinter | null> {
  if (!isWebUsbSupported()) return null;
  try {
    const devices = await navigator.usb!.getDevices();
    for (const device of devices) {
      try {
        const printer = await openUsbPrinter(device);
        return printer;
      } catch {
        // Claimed by the OS driver, or no print interface — try the next one.
      }
    }
  } catch {
    /* getDevices unavailable or rejected */
  }
  return null;
}

// ── Web Bluetooth ─────────────────────────────────────────────────────────────

/**
 * GATT service UUIDs commonly exposed by ESC/POS Bluetooth printers. Listed as
 * optionalServices so the device chooser will let us reach them after pairing.
 */
const KNOWN_PRINTER_SERVICES: BluetoothServiceUUID[] = [
  0x18f0, // common ESC/POS print service
  0xff00,
  0xffe0, // HM-10 style serial bridge
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC / Microchip transparent UART
];

async function findWritableCharacteristic(
  gatt: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  const services = await gatt.getPrimaryServices().catch(() => [] as BluetoothRemoteGATTService[]);
  for (const service of services) {
    const chars = await service.getCharacteristics().catch(() => [] as BluetoothRemoteGATTCharacteristic[]);
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c;
    }
  }
  return null;
}

/**
 * Connect a chosen Bluetooth device's GATT server and wrap its writable
 * characteristic as a {@link ThermalPrinter}. Shared by the chooser path
 * ({@link connectBluetoothPrinter}) and silent reconnect
 * ({@link getGrantedBluetoothPrinter}).
 */
async function openBluetoothPrinter(device: BluetoothDevice): Promise<ThermalPrinter> {
  const gatt = device.gatt;
  if (!gatt) throw new Error("That Bluetooth device exposes no GATT server.");
  await gatt.connect();
  const characteristic = await findWritableCharacteristic(gatt);
  if (!characteristic) {
    gatt.disconnect();
    throw new Error("No writable print service found on that device.");
  }
  const preferNoResponse = characteristic.properties.writeWithoutResponse;

  return {
    kind: "bluetooth",
    name: device.name || "Bluetooth printer",
    device,
    isConnected: () => gatt.connected,
    async write(data: Uint8Array) {
      if (!gatt.connected) throw new Error("Bluetooth printer is disconnected.");
      // BLE caps each write near the MTU; chunk conservatively and pace the
      // writes so a cheap printer's buffer keeps up.
      const CHUNK = 180;
      for (let i = 0; i < data.length; i += CHUNK) {
        const slice = data.subarray(i, i + CHUNK);
        if (preferNoResponse) await characteristic.writeValueWithoutResponse(slice);
        else await characteristic.writeValue(slice);
        await delay(16);
      }
    },
    async close() {
      if (gatt.connected) gatt.disconnect();
    },
    onDisconnect(cb: () => void) {
      device.addEventListener("gattserverdisconnected", cb);
    },
  };
}

/**
 * Prompt the user to pick a Bluetooth printer and resolve a writable
 * characteristic. Must be called from a user gesture.
 */
export async function connectBluetoothPrinter(): Promise<ThermalPrinter> {
  if (!isWebBluetoothSupported()) {
    throw new Error("Bluetooth printing isn’t supported in this browser. Try Chrome on Android/desktop.");
  }
  const device = await navigator.bluetooth!.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_PRINTER_SERVICES,
  });
  return openBluetoothPrinter(device);
}

/**
 * Silently reconnect to a Bluetooth printer the user already paired — no
 * chooser. `getDevices()` is newer than the chooser API (and gated behind a
 * flag in some Chrome builds), and re-establishing a GATT link outside a user
 * gesture can be refused, so every failure mode resolves to null and the caller
 * falls back to the HTML receipt rather than erroring.
 */
export async function getGrantedBluetoothPrinter(): Promise<ThermalPrinter | null> {
  // getDevices() is newer than the chooser API and absent from the TS DOM lib,
  // so reach it through a narrow structural cast and feature-detect at runtime.
  const bt = navigator.bluetooth as (Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> }) | undefined;
  if (!isWebBluetoothSupported() || typeof bt?.getDevices !== "function") {
    return null;
  }
  try {
    const devices = await bt.getDevices();
    for (const device of devices) {
      try {
        return await openBluetoothPrinter(device);
      } catch {
        // Out of range, powered off, or gesture-gated reconnect — try the next.
      }
    }
  } catch {
    /* getDevices unavailable or rejected */
  }
  return null;
}
