/**
 * Client for the labor shift-clock (`/api/v1/merchant/shifts/*`) — the cashier
 * time-clock engine. A signed-in worker only ever reads/writes their OWN clock:
 * the backend resolves tenant + user from the session cookie, never an id in the
 * URL, so there is nothing scoped to pass here. Every call rides with
 * `credentials: "include"`.
 */
import { API_BASE_URL } from "./api";
import type { Result } from "./hr";

const BASE = `${API_BASE_URL}/api/v1/merchant/shifts`;

export type TimecardStatus = "ACTIVE" | "COMPLETED";

export interface Timecard {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  status: TimecardStatus;
  durationMinutes: number;
}

export interface ClockStatus {
  timecard: Timecard | null;
  todayMinutes: number;
}

export interface MyTimecards {
  timecards: Timecard[];
  weekMinutes: number;
  monthMinutes: number;
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

export async function getClockStatus(): Promise<Result<ClockStatus>> {
  try {
    return await readJson(await fetch(`${BASE}/status`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function clockIn(): Promise<Result<{ timecard: Timecard }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/clock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function clockOut(): Promise<Result<{ timecard: Timecard }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/clock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function getMyTimecards(): Promise<Result<MyTimecards>> {
  try {
    return await readJson(await fetch(`${BASE}/me`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Shared duration formatting ──────────────────────────────────────────────

/** Whole minutes → "2h 14m" / "47m" / "0m". For at-a-glance pills and totals. */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}

/** Seconds → "HH:MM:SS", for the live ticking clock face. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
