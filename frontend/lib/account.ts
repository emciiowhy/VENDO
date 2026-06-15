/**
 * Client for the owner Account hub (`/api/v1/account/*`) — store profile,
 * receipt customization, personal profile, preferences, device sessions, login
 * audit, data export and store deactivation. Tenant + user scope are enforced
 * server-side from the session cookie, so every call just rides with
 * `credentials: "include"`. Mutations are JSON; image uploads are multipart.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/account`;

type Ok<T> = ({ ok: true } & T) | { ok: false; error?: string; errors?: Record<string, string> };

async function getJson<T>(path: string): Promise<Ok<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: "include" });
    return (await res.json()) as Ok<T>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

async function send<T>(path: string, method: "PATCH" | "POST" | "DELETE", body?: unknown): Promise<Ok<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    return (await res.json()) as Ok<T>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

async function upload<T>(path: string, file: File): Promise<Ok<T>> {
  try {
    const form = new FormData();
    form.append("image", file);
    const res = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form });
    return (await res.json()) as Ok<T>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

// ── Store profile ───────────────────────────────────────────────────────────

export interface StoreProfile {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  businessHours: string | null;
  tin: string | null;
  logoUrl: string | null;
  /** The store's brand accent as `#rrggbb`, or null for the default blue. */
  themeColor: string | null;
}

export interface StoreProfileInput {
  name: string;
  slug?: string;
  address?: string;
  phone?: string;
  email?: string;
  businessHours?: string;
  tin?: string;
}

export const getStore = () => getJson<{ store: StoreProfile }>("/store");
export const saveStore = (input: StoreProfileInput) =>
  send<{ store: StoreProfile }>("/store", "PATCH", input);
export const uploadLogo = (file: File) => upload<{ logoUrl: string }>("/store/logo", file);
export const removeLogo = () => send<Record<string, never>>("/store/logo", "DELETE");

// ── Appearance / brand theme ──────────────────────────────────────────────────

/** Set the store's brand accent (`#rrggbb`), or pass null to reset to default. */
export const saveTheme = (accent: string | null) =>
  send<{ accent: string | null }>("/theme", "PATCH", { accent });

// ── Receipt customization ─────────────────────────────────────────────────────

export interface ReceiptSettings {
  header: string | null;
  footer: string | null;
  vatLabel: string | null;
  invoicePrefix: string | null;
  showLogo: boolean;
  /** BIR machine-accreditation footer fields. */
  ptu: string | null;
  min: string | null;
  serial: string | null;
}

export interface ReceiptSettingsInput {
  header?: string;
  footer?: string;
  vatLabel?: string;
  invoicePrefix?: string;
  showLogo: boolean;
  ptu?: string;
  min?: string;
  serial?: string;
}

export const getReceipt = () => getJson<{ settings: ReceiptSettings }>("/receipt");
export const saveReceipt = (input: ReceiptSettingsInput) =>
  send<{ settings: ReceiptSettings }>("/receipt", "PATCH", input);

// ── Personal profile ──────────────────────────────────────────────────────────

export interface OwnerProfile {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
}

export const getProfile = () => getJson<{ profile: OwnerProfile }>("/profile");
export const saveProfile = (input: { name: string; phone?: string }) =>
  send<{ profile: OwnerProfile }>("/profile", "PATCH", input);
export const uploadAvatar = (file: File) => upload<{ avatarUrl: string }>("/profile/avatar", file);
export const removeAvatar = () => send<Record<string, never>>("/profile/avatar", "DELETE");

// ── Preferences ───────────────────────────────────────────────────────────────

export interface Preferences {
  theme: "light" | "dark" | "system";
  notifyLowStock: boolean;
  notifyVariance: boolean;
  notifyDailySummary: boolean;
}

export const getPreferences = () => getJson<{ preferences: Preferences }>("/preferences");
export const savePreferences = (input: Preferences) =>
  send<{ preferences: Preferences }>("/preferences", "PATCH", input);

// ── Device sessions ─────────────────────────────────────────────────────────

export interface DeviceSession {
  id: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export const getSessions = () => getJson<{ sessions: DeviceSession[] }>("/sessions");
export const revokeSession = (id: string) => send<Record<string, never>>(`/sessions/${id}`, "DELETE");
export const revokeOtherSessions = () =>
  send<{ revoked: number }>("/sessions/revoke-others", "POST", {});

// ── Login audit ───────────────────────────────────────────────────────────────

export interface LoginEvent {
  id: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  at: string;
}

export const getLoginEvents = () => getJson<{ events: LoginEvent[] }>("/login-events");

// ── Data export ─────────────────────────────────────────────────────────────

export type ExportDataset = "sales" | "inventory" | "customers";

/** Direct download URL for a dataset CSV (cookie auth rides on the navigation). */
export const exportUrl = (dataset: ExportDataset) => `${BASE}/export/${dataset}.csv`;

// ── Danger zone ───────────────────────────────────────────────────────────────

export const deactivateStore = (password: string) =>
  send<Record<string, never>>("/deactivate", "POST", { password });
