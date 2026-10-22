/**
 * Owner client for cashier-PIN administration (`/api/v1/staff/*`). OWNER-only
 * server-side; the session cookie scopes everything to the signed-in Tenant.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/staff`;

export interface CashierShiftBrief {
  id: string;
  openedAt: string;
  openingCents: number;
  expectedCashCents: number;
}

export interface CashierSummary {
  id: string;
  name: string;
  status: string;
  hasPin: boolean;
  pendingRequest: boolean;
  defaultFloatCents: number;
  shift: CashierShiftBrief | null;
}

/** Frozen Z-Read returned when an owner force-closes a cashier's shift. */
export interface ForceCloseZRead {
  cashierName: string;
  expectedCashCents: number;
  countedCashCents: number;
  cashVarianceCents: number;
}

export interface PinRequest {
  id: string;
  cashierUserId: string;
  cashierName: string;
  createdAt: string;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error?: string; errors?: Record<string, string> };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

export async function getStaff(): Promise<Result<{ cashiers: CashierSummary[]; requests: PinRequest[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/cashiers`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function createCashier(input: {
  name: string;
  pin?: string;
  defaultFloatCents?: number;
}): Promise<Result<{ cashier: CashierSummary }>> {
  try {
    const body: Record<string, unknown> = { name: input.name };
    if (input.pin) body.pin = input.pin;
    if (input.defaultFloatCents !== undefined) body.defaultFloatCents = input.defaultFloatCents;
    const res = await fetch(`${BASE}/cashiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateCashier(
  cashierId: string,
  fields: { name?: string; status?: "active" | "disabled"; defaultFloatCents?: number },
): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/cashiers/${cashierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(fields),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteCashier(cashierId: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/cashiers/${cashierId}`, {
      method: "DELETE",
      credentials: "include",
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

/** Owner force-closes (Z-Reads) a cashier's open shift. Omit countedCents to record the expected drawer. */
export async function forceCloseShift(
  cashierId: string,
  opts?: { countedCents?: number; note?: string },
): Promise<Result<{ zread: ForceCloseZRead }>> {
  try {
    const body: Record<string, unknown> = {};
    if (opts?.countedCents !== undefined) body.countedCents = opts.countedCents;
    if (opts?.note) body.note = opts.note;
    const res = await fetch(`${BASE}/cashiers/${cashierId}/close-shift`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function setCashierPin(cashierId: string, pin: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/cashiers/${cashierId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin }),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

export async function rejectPinRequest(requestId: string): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/pin-requests/${requestId}/reject`, {
      method: "POST",
      credentials: "include",
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}

// ── Attendance (hours from Shift In / Shift Out) ────────────────────────────

export interface CashierPunch {
  id: string;
  clockIn: string;
  clockOut: string | null;
  minutes: number;
  /** Still on the clock right now. */
  open: boolean;
  /** A forgotten Shift Out — counts no hours until the owner enters the real Time Out. */
  needsReview: boolean;
}

export interface CashierDay {
  date: string;
  workedMinutes: number;
  needsReview: boolean;
  punches: CashierPunch[];
}

export interface CashierAttendanceTotals {
  daysWorked: number;
  workedMinutes: number;
  punches: number;
  needsReview: number;
}

export interface CashierAttendanceRow extends CashierAttendanceTotals {
  userId: string;
  name: string;
  status: string;
  onClock: boolean;
}

export interface StoreAttendanceDay {
  date: string;
  workedMinutes: number;
  cashiers: number;
  needsReview: boolean;
}

/** Every cashier's month totals plus the store-wide calendar. `month` is YYYY-MM. */
export async function getStoreAttendance(
  month: string,
): Promise<Result<{ month: string; rows: CashierAttendanceRow[]; days: StoreAttendanceDay[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/attendance?month=${month}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** One cashier's month: each day's punches and the totals. */
export async function getCashierAttendance(
  cashierId: string,
  month: string,
): Promise<
  Result<{
    month: string;
    cashier: { id: string; name: string; status: string };
    days: CashierDay[];
    totals: CashierAttendanceTotals;
  }>
> {
  try {
    return await readJson(
      await fetch(`${BASE}/cashiers/${cashierId}/attendance?month=${month}`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** Enter a punch's real Time In / Time Out (ISO instants) — the fix for a forgotten Shift Out. */
export async function correctCashierTimecard(
  timecardId: string,
  times: { clockIn?: string; clockOut: string },
): Promise<Result<Record<string, never>>> {
  try {
    const res = await fetch(`${BASE}/timecards/${timecardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(times),
    });
    return await readJson(res);
  } catch {
    return NETWORK_ERR;
  }
}
