import { z } from "zod";

/**
 * Validation for the Merchant HR module (employees + attendance + payroll).
 *
 * Money is accepted as a peso number/string and normalised to integer centavos
 * (the standard money discipline). Attendance hours are a non-negative decimal.
 */

export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract"] as const;
export const PAY_TYPES = ["Monthly", "Daily", "Hourly"] as const;
export const ATTENDANCE_STATUSES = ["Present", "Absent", "Leave", "Half-day"] as const;

const pesosToCents = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[₱,\s]/g, ""))))
  .refine((n) => Number.isFinite(n) && n >= 0, "Enter a valid amount.")
  .transform((n) => Math.round(n * 100));

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD).")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Enter a valid date.");

const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  isoDate.optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().email("Enter a valid email.").max(160).optional(),
);

const booleanField = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
  .optional();

const hoursField = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim() || "0")))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 24, "Enter hours between 0 and 24.");

const daysField = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(String(v).trim() || "0")))
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 9999, "Enter a valid number of days.");

// ── Employees ────────────────────────────────────────────────────────────────

export const employeeCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  position: optionalText(120),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("Full-time"),
  payType: z.enum(PAY_TYPES).default("Monthly"),
  payRate: pesosToCents.default(0),
  hireDate: optionalDate,
  phone: optionalText(40),
  email: optionalEmail,
  note: optionalText(500),
  isActive: booleanField,
  // Personal dossier
  address: optionalText(240),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: optionalText(40),
  // Financial suite — direct deposit. The account number is write-only: the API
  // never returns it raw, only its last 4 (see toEmployee). Send a new value to
  // replace it; omit to leave the stored one untouched.
  bankName: optionalText(120),
  bankAccountName: optionalText(120),
  bankAccountNumber: optionalText(40),
  ptoBalanceDays: daysField.optional(),
});

export const employeeUpdateSchema = employeeCreateSchema.partial();

// ── Attendance ───────────────────────────────────────────────────────────────

export const attendanceUpsertSchema = z.object({
  employeeId: z.string().trim().uuid("Choose a valid employee."),
  workDate: isoDate,
  status: z.enum(ATTENDANCE_STATUSES),
  hours: hoursField.default(0),
  note: optionalText(240),
});

// ── Payroll ──────────────────────────────────────────────────────────────────

export const payrollRunSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    note: optionalText(240),
  })
  .refine((d) => d.periodStart <= d.periodEnd, {
    message: "The period end must be on or after the start.",
    path: ["periodEnd"],
  });

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;
export type AttendanceUpsertInput = z.infer<typeof attendanceUpsertSchema>;
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;

// ── API-facing shapes ─────────────────────────────────────────────────────────

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
  /** Last 4 digits only — the raw account number never leaves the database. */
  bankAccountLast4: string | null;
  ptoBalanceDays: number;
  createdAt: string;
  updatedAt: string;
}

/** One day of an employee's attendance, for the profile/ESS calendar. */
export interface AttendanceDay {
  date: string;
  status: string;
  hours: number;
}

/** A single line an employee earned in a past payroll run (their paystub). */
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

/**
 * Hours split on the PH 8-hour standard day: anything past 8 logged hours on a
 * day is overtime. Daily/Monthly staff (who don't log hours) count a present
 * day as 8 regular hours, a half-day as 4.
 */
export interface HoursBreakdown {
  daysPresent: number;
  hoursWorked: number;
  regularHours: number;
  overtimeHours: number;
  attendanceRatePct: number;
}

/** The deep-dive employee file: record + month attendance + paystub archive. */
export interface EmployeeDetail extends Employee {
  month: string;
  attendanceMonth: AttendanceDay[];
  hours: HoursBreakdown;
  ptoUsedYtd: number;
  payslips: EmployeePayslip[];
  performance: PerformanceRow | null;
}

/**
 * One employee's operational performance over a window. Sales / drawer figures
 * exist only for employees linked to a cashier login (`user_id`); `linked`
 * flags whether register data was available. NOTE: true shift punctuality needs
 * a shift schedule + clock-in timestamps, which the attendance model does not
 * carry — `attendanceRatePct` is the honest reliability proxy until that lands.
 */
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
  /** 100 = drawer always balanced; null = no closed shifts in range. */
  drawerAccuracyPct: number | null;
}

export interface PerformanceReport {
  from: string;
  to: string;
  rows: PerformanceRow[];
}

/** A worker currently on the clock (an open cashier shift). */
export interface RosterEntry {
  shiftId: string;
  userId: string | null;
  name: string;
  openingCents: number;
  openedAt: string;
}

/** The HR executive overview hub. */
export interface HrOverview {
  headcount: number;
  activeHeadcount: number;
  newHiresThisMonth: number;
  separationsThisMonth: number;
  /** Rolling 30-day retention: kept ÷ (kept + separated) over the window. */
  retentionRatePct: number;
  departments: { name: string; count: number }[];
  employmentTypes: { type: string; count: number }[];
  payTypes: { type: string; count: number }[];
  presentToday: number;
  roster: RosterEntry[];
  pendingPinRequests: number;
}

/** The Employee Self-Service view of one's own record. */
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

/** An employee row plus their attendance for a queried date (null if unmarked). */
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
}
