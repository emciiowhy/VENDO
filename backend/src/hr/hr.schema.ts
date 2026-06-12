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
  createdAt: string;
  updatedAt: string;
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
