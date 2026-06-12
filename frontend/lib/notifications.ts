/**
 * Client for the per-user notification feed (`/api/v1/notifications/*`). Open to
 * every signed-in role; the bell in the shared shell polls it. Scope is enforced
 * server-side from the session cookie, so calls just ride `credentials:"include"`.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/notifications`;

export type NotificationType =
  | "low_stock"
  | "variance"
  | "pin_request"
  | "new_lead"
  | "new_tenant"
  | "health";

export type Severity = "info" | "success" | "warning" | "danger";

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: Severity;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  notifications: AppNotification[];
  unread: number;
}

export async function getNotifications(): Promise<NotificationFeed | null> {
  try {
    const res = await fetch(`${BASE}/`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean } & NotificationFeed;
    return data.ok ? { notifications: data.notifications, unread: data.unread } : null;
  } catch {
    return null;
  }
}

export async function getUnreadCount(): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/unread-count`, { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; unread: number };
    return data.ok ? data.unread : null;
  } catch {
    return null;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/${id}/read`, { method: "POST", credentials: "include" });
  } catch {
    /* best-effort */
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await fetch(`${BASE}/read-all`, { method: "POST", credentials: "include" });
  } catch {
    /* best-effort */
  }
}
