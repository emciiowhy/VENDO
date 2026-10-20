/**
 * Client for the Merchant HR module (`/api/v1/hr/*`) — employees, attendance,
 * payroll. Payroll gross is computed server-side from each employee's pay type
 * and attendance in the period. Tenant scope is enforced from the session
 * cookie; every call rides with `credentials: "include"`. Payloads are JSON.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/hr`;

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract"] as const;
export const PAY_TYPES = ["Monthly", "Daily", "Hourly"] as const;
export const ATTENDANCE_STATUSES = ["Present", "Absent", "Leave", "Half-day"] as const;

export type PayType = (typeof PAY_TYPES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface Employee {
  id: string;
  userId: string | null;
  name: string;
  position: string | null;
  employmentType: string;
  payType: string;
  payRateCents: number;
  payRate: number;
  hireDate: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  isActive: boolean;
  separatedOn: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountLast4: string | null;
  ptoBalanceDays: number;
  /** Scheduled weekdays, 0 = Sunday … 6 = Saturday. */
  workDays: number[];
  standardDailyHours: number;
  unpaidBreakMinutes: number;
  createdAt: string;
  updatedAt: string;
}

/** A day's derived attendance status (see backend hr/attendance.ts). */
export type DayStatus =
  | "present"
  | "half_day"
  | "absent"
  | "leave"
  | "rest_day"
  | "unscheduled"
  | "pending"
  | "needs_review";

export interface PunchView {
  id: string;
  /** Shift In (ISO). */
  timeIn: string;
  /** Shift Out (ISO), null while on the clock or if forgotten. */
  timeOut: string | null;
  minutes: number;
  open: boolean;
  needsReview: boolean;
}

/** One day of attendance, derived from the schedule + Shift In/Out + manual entries. */
export interface AttendanceDay {
  date: string;
  weekday: number;
  scheduled: boolean;
  status: DayStatus;
  punches: PunchView[];
  grossMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  manual: boolean;
  note: string | null;
  restDayWorked: boolean;
}

export interface AttendanceSummary {
  scheduledDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  restDays: number;
  needsReviewDays: number;
  workedMinutes: number;
}

export interface TeamAttendanceRow {
  employeeId: string;
  name: string;
  position: string | null;
  hasTillAccess: boolean;
  summary: AttendanceSummary;
}

export interface EmployeePayslip {
  runId: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  payType: string;
  payRateCents: number;
  basisQty: number;
  grossCents: number;
  createdAt: string;
}

export interface HoursBreakdown {
  daysPresent: number;
  hoursWorked: number;
  regularHours: number;
  overtimeHours: number;
  attendanceRatePct: number;
}

export interface PerformanceRow {
  employeeId: string;
  userId: string | null;
  name: string;
  position: string | null;
  linked: boolean;
  daysPresent: number;
  hoursWorked: number;
  regularHours: number;
  overtimeHours: number;
  attendanceRatePct: number;
  salesCents: number;
  txnCount: number;
  salesPerHourCents: number;
  shiftsClosed: number;
  drawerVarianceCents: number;
  drawerAccuracyPct: number | null;
}

export interface PerformanceReport {
  from: string;
  to: string;
  rows: PerformanceRow[];
}

export interface RosterEntry {
  shiftId: string;
  userId: string | null;
  name: string;
  openingCents: number;
  openedAt: string;
}

export interface HrOverview {
  headcount: number;
  activeHeadcount: number;
  newHiresThisMonth: number;
  separationsThisMonth: number;
  retentionRatePct: number;
  departments: { name: string; count: number }[];
  employmentTypes: { type: string; count: number }[];
  payTypes: { type: string; count: number }[];
  presentToday: number;
  roster: RosterEntry[];
  pendingPinRequests: number;
}

export interface EmployeeDetail extends Employee {
  month: string;
  attendanceMonth: AttendanceDay[];
  attendanceSummary: AttendanceSummary;
  hours: HoursBreakdown;
  ptoUsedYtd: number;
  payslips: EmployeePayslip[];
  performance: PerformanceRow | null;
}

export interface AttendanceRow {
  employeeId: string;
  name: string;
  position: string | null;
  payType: string;
  status: string | null;
  hours: number;
}

export interface PayrollItem {
  id: string;
  employeeId: string | null;
  name: string;
  payType: string;
  payRateCents: number;
  basisQty: number;
  grossCents: number;
  sssCents: number;
  philhealthCents: number;
  pagibigCents: number;
  withholdingTaxCents: number;
  totalDeductionsCents: number;
  netCents: number;
}

export interface PayrollRunSummary {
  id: string;
  reference: string;
  periodStart: string;
  periodEnd: string;
  totalGrossCents: number;
  headcount: number;
  createdAt: string;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  note: string | null;
  items: PayrollItem[];
  totalDeductionsCents: number;
  totalNetCents: number;
}

export interface HrSummary {
  headcount: number;
  presentToday: number;
  payrollRunsThisMonth: number;
  lastPayrollGrossCents: number;
}

// ── Labor analytics (shift-clock hours vs. sales) ──────────────────────────

export interface ActiveStaffMember {
  userId: string;
  name: string;
  clockIn: string;
  elapsedMinutes: number;
}

export interface CashierEfficiencyRow {
  userId: string;
  name: string;
  laborMinutes: number;
  laborHours: number;
  orders: number;
  revenueCents: number;
  revenuePerHourCents: number;
  avgOrderCents: number;
  minutesPerOrder: number;
  payCents: number;
}

export interface LaborAnalytics {
  from: string;
  to: string;
  hourlyRateCents: number;
  laborMinutes: number;
  laborHours: number;
  grossSalesCents: number;
  laborCostCents: number;
  laborCostPct: number;
  salesPerLaborHourCents: number;
  activeStaff: ActiveStaffMember[];
  cashiers: CashierEfficiencyRow[];
}

// ── Payroll export (timecard-based, with OT + night differential) ───────────

export interface PayrollExportLine {
  employeeId: string;
  name: string;
  position: string | null;
  payType: string;
  hourlyRateCents: number;
  daysWorked: number;
  regularHours: number;
  overtimeHours: number;
  nightDiffHours: number;
  totalHours: number;
  regularPayCents: number;
  overtimePayCents: number;
  nightDiffPayCents: number;
  grossCents: number;
  sssCents: number;
  philhealthCents: number;
  pagibigCents: number;
  withholdingTaxCents: number;
  totalDeductionsCents: number;
  netCents: number;
}

export interface PayrollExportReport {
  from: string;
  to: string;
  includeNightDifferential: boolean;
  lines: PayrollExportLine[];
  totals: {
    headcount: number;
    regularHours: number;
    overtimeHours: number;
    nightDiffHours: number;
    grossCents: number;
    totalDeductionsCents: number;
    netCents: number;
  };
}

// ── Shift discrepancy matrix (drawer reconciliation audit) ──────────────────

export type ShiftStatus = "balanced" | "short" | "over";

export interface ShiftReconciliation {
  id: string;
  cashierUserId: string | null;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingCents: number;
  cashSalesCents: number;
  ewalletSalesCents: number;
  cardSalesCents: number;
  totalSalesCents: number;
  txnCount: number;
  expectedCashCents: number;
  countedCashCents: number;
  varianceCents: number;
  status: ShiftStatus;
  note: string | null;
}

export interface ShiftReconciliationReport {
  from: string;
  to: string;
  rows: ShiftReconciliation[];
  totals: {
    shifts: number;
    netVarianceCents: number;
    absVarianceCents: number;
    shortCount: number;
    overCount: number;
    balancedCount: number;
  };
}

export interface EmployeeFields {
  name: string;
  position: string;
  employmentType: string;
  payType: string;
  payRate: string; // pesos
  hireDate: string;
  phone: string;
  email: string;
  note: string;
  isActive: boolean;
  // Optional dossier + financial-suite fields (sent only when present).
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string; // write-only; never returned by the API
  ptoBalanceDays?: string; // days
  // Work schedule (sent as numbers).
  workDays?: number[];
  standardDailyHours?: number;
  unpaidBreakMinutes?: number;
}

export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; error?: string; errors?: Record<string, string> };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = { ok: false as const, error: "Could not reach the server. Check your connection." };

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getHrSummary(): Promise<Result<{ summary: HrSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/summary`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getHrOverview(): Promise<Result<{ overview: HrOverview }>> {
  try {
    return await readJson(await fetch(`${BASE}/overview`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getPerformance(from?: string, to?: string): Promise<Result<{ report: PerformanceReport }>> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  try {
    return await readJson(await fetch(`${BASE}/performance${suffix}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getLaborAnalytics(
  from?: string,
  to?: string,
  rateCents?: number,
): Promise<Result<{ analytics: LaborAnalytics }>> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (rateCents !== undefined) qs.set("rateCents", String(rateCents));
  const suffix = qs.toString() ? `?${qs}` : "";
  try {
    return await readJson(await fetch(`${BASE}/labor-analytics${suffix}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getEmployeeDetail(id: string, month?: string): Promise<Result<{ employee: EmployeeDetail }>> {
  const suffix = month ? `?month=${month}` : "";
  try {
    return await readJson(await fetch(`${BASE}/employees/${id}${suffix}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listEmployees(): Promise<Result<{ employees: Employee[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/employees`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getAttendance(date: string): Promise<Result<{ date: string; attendance: AttendanceRow[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/attendance?date=${date}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Build the export query string shared by the preview fetch and the CSV link. */
function payrollExportQuery(opts: {
  from: string;
  to: string;
  nightDiff: boolean;
  employeeId?: string;
}): string {
  const qs = new URLSearchParams({ from: opts.from, to: opts.to, nightDiff: opts.nightDiff ? "1" : "0" });
  if (opts.employeeId) qs.set("employeeId", opts.employeeId);
  return qs.toString();
}

/** The live payroll preview the export studio renders before download. */
export async function getPayrollExportPreview(opts: {
  from: string;
  to: string;
  nightDiff: boolean;
  employeeId?: string;
}): Promise<Result<{ report: PayrollExportReport }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/payroll/export/preview?${payrollExportQuery(opts)}`, { credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/**
 * The tenant-scoped CSV download URL. Used as a plain <a href download> so the
 * session cookie rides the top-level navigation and the server streams an
 * attachment (mirrors the account data-export links).
 */
export function payrollExportUrl(opts: {
  from: string;
  to: string;
  nightDiff: boolean;
  employeeId?: string;
}): string {
  return `${BASE}/payroll/export?${payrollExportQuery(opts)}`;
}

/** The manager shift-discrepancy matrix — closed shifts with drawer variance. */
export async function getShiftReconciliations(
  from?: string,
  to?: string,
): Promise<Result<{ report: ShiftReconciliationReport }>> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs}` : "";
  try {
    return await readJson(await fetch(`${BASE}/shift-reconciliations${suffix}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function listPayrollRuns(): Promise<Result<{ runs: PayrollRunSummary[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/payroll`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

export async function getPayrollRun(id: string): Promise<Result<{ run: PayrollRunDetail }>> {
  try {
    return await readJson(await fetch(`${BASE}/payroll/${id}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createEmployee(fields: EmployeeFields): Promise<Result<{ employee: Employee }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/employees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function updateEmployee(id: string, fields: Partial<EmployeeFields>): Promise<Result<{ employee: Employee }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function deleteEmployee(id: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(await fetch(`${BASE}/employees/${id}`, { method: "DELETE", credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

// ── Till access (Employee ↔ Cashier bridge, ADR 0002) ─────────────────────────

/** A cashier login linked to an employee, returned after granting till access. */
export interface TillCashier {
  id: string;
  name: string;
  status: string;
  hasPin: boolean;
  defaultFloatCents: number;
}

/** An active cashier login with no linked employee — a candidate to link. */
export interface UnlinkedCashier {
  id: string;
  name: string;
  hasPin: boolean;
}

/** Grant input: provision a new cashier login, or link an existing unlinked one. */
export type TillAccessInput =
  | { mode: "create"; pin?: string; defaultFloatCents: number }
  | { mode: "link"; cashierUserId: string };

/** Active cashier logins with no linked employee — the "link existing" choices. */
export async function listUnlinkedCashiers(): Promise<Result<{ cashiers: UnlinkedCashier[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/cashiers/unlinked`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Grant an employee till access (create a cashier login or link an existing one). */
export async function grantTillAccess(
  employeeId: string,
  input: TillAccessInput,
): Promise<Result<{ cashier: TillCashier }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/employees/${employeeId}/till-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** Adopt input: create a new employee from the cashier, or link an existing one. */
export type AdoptCashierInput = { mode: "create" } | { mode: "link"; employeeId: string };

/** Adopt an unlinked cashier into HR (create a new employee, or link an existing one). */
export async function adoptCashier(
  cashierUserId: string,
  input: AdoptCashierInput,
): Promise<Result<{ employee: Employee }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/cashiers/${cashierUserId}/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function saveAttendance(input: {
  employeeId: string;
  workDate: string;
  status: string;
  hours: number;
}): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(
      await fetch(`${BASE}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

export async function runPayroll(input: {
  periodStart: string;
  periodEnd: string;
  note?: string;
}): Promise<Result<{ run: PayrollRunDetail }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

// ── Attendance (Shift In / Shift Out) ────────────────────────────────────────

/** Every employee's totals for a month — the Attendance tab. */
export async function getTeamAttendance(month: string): Promise<Result<{ month: string; rows: TeamAttendanceRow[] }>> {
  try {
    return await readJson(await fetch(`${BASE}/attendance/month?month=${month}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** One employee's month, day by day, with the totals. */
export async function getEmployeeAttendance(
  id: string,
  month: string,
): Promise<Result<{ month: string; days: AttendanceDay[]; summary: AttendanceSummary }>> {
  try {
    return await readJson(await fetch(`${BASE}/employees/${id}/attendance?month=${month}`, { credentials: "include" }));
  } catch {
    return NETWORK_ERR;
  }
}

/** Manager sets a timecard's real Time In / Time Out (ISO instants). */
export async function correctTimecard(
  id: string,
  body: { clockIn?: string; clockOut: string },
): Promise<Result<{ timecard: { clockIn: string; clockOut: string } }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/timecards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/** Remove a manual entry for a day, so it goes back to the timecards. */
export async function clearAttendance(employeeId: string, date: string): Promise<Result<Record<string, never>>> {
  try {
    return await readJson(
      await fetch(`${BASE}/attendance?employeeId=${employeeId}&date=${date}`, { method: "DELETE", credentials: "include" }),
    );
  } catch {
    return NETWORK_ERR;
  }
}
