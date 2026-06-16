/**
 * Minimal ambient typings for the WebUSB and Web Bluetooth surfaces the POS
 * thermal-printer adapter touches. These specs ship in Chromium but are NOT part
 * of the standard `lib.dom` typings, so without this declaration `tsc` would
 * reject `navigator.usb` / `navigator.bluetooth`. We deliberately model only the
 * members `lib/thermalPrinter.ts` calls — adding a full @types dependency would
 * be far more surface than the adapter uses. Everything is optional on the
 * Navigator so feature detection (`navigator.usb`, `navigator.bluetooth`) stays
 * honest on browsers that don't implement them.
 *
 * (No imports/exports — this stays a global ambient script so the Navigator
 * augmentation merges into the built-in interface.)
 */

// ── WebUSB ──────────────────────────────────────────────────────────────────
interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: "in" | "out";
}
interface USBAlternateInterface {
  readonly endpoints: USBEndpoint[];
}
interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
}
interface USBConfiguration {
  readonly configurationValue: number;
  readonly interfaces: USBInterface[];
}
interface USBOutTransferResult {
  readonly status: "ok" | "stall" | "babble";
  readonly bytesWritten: number;
}
interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
}
interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[];
}
interface USBDevice {
  readonly productName?: string;
  readonly manufacturerName?: string;
  readonly opened: boolean;
  readonly configuration: USBConfiguration | null;
  readonly configurations: USBConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<USBOutTransferResult>;
}
interface USB {
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
  getDevices(): Promise<USBDevice[]>;
}

// ── Web Bluetooth ─────────────────────────────────────────────────────────────
type BluetoothServiceUUID = string | number;

interface BluetoothCharacteristicProperties {
  readonly write: boolean;
  readonly writeWithoutResponse: boolean;
}
interface BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  writeValue(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
}
interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristic(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}
interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}
interface BluetoothDevice {
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  addEventListener(type: "gattserverdisconnected", listener: () => void): void;
  removeEventListener(type: "gattserverdisconnected", listener: () => void): void;
}
interface BluetoothLEScanFilter {
  services?: BluetoothServiceUUID[];
  name?: string;
  namePrefix?: string;
}
interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[];
  optionalServices?: BluetoothServiceUUID[];
  acceptAllDevices?: boolean;
}
interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getAvailability(): Promise<boolean>;
}

interface Navigator {
  readonly usb?: USB;
  readonly bluetooth?: Bluetooth;
}
