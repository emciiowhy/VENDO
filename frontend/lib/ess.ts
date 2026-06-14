/**
 * Client for the Employee Self-Service portal (`/api/v1/ess/me`). A signed-in
 * worker reads only their OWN record — the backend resolves it from the session
 * cookie, never an id in the URL — so there's nothing tenant- or employee-scoped
 * to pass here. Reuses the HR shapes for attendance, hours and paystubs.
 */
import { API_BASE_URL } from "./api";
import type { AttendanceDay, EmployeePayslip, HoursBreakdown, Result } from "./hr";

const BASE = `${API_BASE_URL}/api/v1/ess`;

export interface EssProfile {
  employee: {
    id: string;
    name: string;
    position: string | null;
    employmentType: string;
    payType: string;
    payRateCents: number;
    hireDate: string | null;
    ptoBalanceDays: number;
  };
  storeName: string | null;
  month: string;
  attendanceMonth: AttendanceDay[];
  hours: HoursBreakdown;
  ptoUsedYtd: number;
  payslips: EmployeePayslip[];
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

export async function getMyEssProfile(month?: string): Promise<Result<{ profile: EssProfile }>> {
  const suffix = month ? `?month=${month}` : "";
  try {
    return await readJson(await fetch(`${BASE}/me${suffix}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}
