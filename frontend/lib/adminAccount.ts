/**
 * Client for the Super Admin account hub (`/api/v1/admin/account/*`) — the
 * operator's own profile, avatar and sign-in password. SUPER_ADMIN-only
 * server-side; the session cookie rides along with `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";
import { shrinkImage } from "./shrinkImage";

const BASE = `${API_BASE_URL}/api/v1/admin/account`;

type Ok<T> = ({ ok: true } & T) | { ok: false; error?: string; errors?: Record<string, string> };

async function getJson<T>(path: string): Promise<Ok<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: "include" });
    return (await res.json()) as Ok<T>;
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
}

async function send<T>(
  path: string,
  method: "PATCH" | "POST" | "DELETE",
  body?: unknown,
): Promise<Ok<T>> {
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
  let res: Response;
  try {
    const form = new FormData();
    form.append("image", await shrinkImage(file));
    res = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form });
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection." };
  }
  try {
    return (await res.json()) as Ok<T>;
  } catch {
    return {
      ok: false,
      error:
        res.status === 413
          ? "That image is too large. Try a smaller photo."
          : `Upload failed (error ${res.status}). Please try again.`,
    };
  }
}

export interface AdminProfile {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
}

export const getProfile = () => getJson<{ profile: AdminProfile }>("/profile");
export const saveProfile = (input: { name: string; phone?: string }) =>
  send<{ profile: AdminProfile }>("/profile", "PATCH", input);
export const uploadAvatar = (file: File) => upload<{ avatarUrl: string }>("/profile/avatar", file);
export const removeAvatar = () => send<Record<string, never>>("/profile/avatar", "DELETE");

export const getPasswordStatus = () => getJson<{ hasPassword: boolean }>("/password/status");
export const setPassword = (input: { currentPassword?: string; newPassword: string }) =>
  send<Record<string, never>>("/password", "POST", input);
