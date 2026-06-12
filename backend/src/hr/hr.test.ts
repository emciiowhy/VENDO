import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { attendanceUpsertSchema, employeeCreateSchema, payrollRunSchema } from "./hr.schema.js";

const app = createApp();
const UUID = "11111111-1111-1111-1111-111111111111";

describe("HR routes require store-management auth", () => {
  it("blocks the summary for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/summary")).status).toBe(401);
  });
  it("blocks listing employees for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/employees")).status).toBe(401);
  });
  it("blocks reading attendance for the unauthenticated with 401", async () => {
    expect((await request(app).get("/api/v1/hr/attendance?date=2026-06-01")).status).toBe(401);
  });
  it("blocks running payroll for the unauthenticated with 401", async () => {
    const res = await request(app)
      .post("/api/v1/hr/payroll")
      .send({ periodStart: "2026-06-01", periodEnd: "2026-06-15" });
    expect(res.status).toBe(401);
  });
});

describe("employeeCreateSchema", () => {
  it("defaults employment/pay type and normalises rate to centavos", () => {
    const e = employeeCreateSchema.parse({ name: "Juan dela Cruz", payRate: 18000 });
    expect(e.employmentType).toBe("Full-time");
    expect(e.payType).toBe("Monthly");
    expect(e.payRate).toBe(1800000); // payRate field holds centavos after transform
  });
  it("requires a name", () => {
    expect(employeeCreateSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("rejects an unknown pay type", () => {
    expect(employeeCreateSchema.safeParse({ name: "X", payType: "Yearly" }).success).toBe(false);
  });
});

describe("attendanceUpsertSchema", () => {
  it("accepts a present day with hours", () => {
    const a = attendanceUpsertSchema.parse({ employeeId: UUID, workDate: "2026-06-11", status: "Present", hours: 8 });
    expect(a.hours).toBe(8);
  });
  it("rejects hours over 24", () => {
    const r = attendanceUpsertSchema.safeParse({ employeeId: UUID, workDate: "2026-06-11", status: "Present", hours: 30 });
    expect(r.success).toBe(false);
  });
  it("rejects an invalid status", () => {
    const r = attendanceUpsertSchema.safeParse({ employeeId: UUID, workDate: "2026-06-11", status: "Vacation" });
    expect(r.success).toBe(false);
  });
});

describe("payrollRunSchema", () => {
  it("accepts a valid period", () => {
    expect(payrollRunSchema.safeParse({ periodStart: "2026-06-01", periodEnd: "2026-06-15" }).success).toBe(true);
  });
  it("rejects an end before the start", () => {
    expect(payrollRunSchema.safeParse({ periodStart: "2026-06-15", periodEnd: "2026-06-01" }).success).toBe(false);
  });
});
