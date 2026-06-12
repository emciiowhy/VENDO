"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { HrConsole } from "../../components/hr/HrConsole";

/**
 * Merchant — HR. Owners/managers manage the employee roster, mark daily
 * attendance, and run gross-pay payroll. Tenant-scoped server-side.
 */
export default function HrPage() {
  return (
    <DashShell
      title="HR"
      subtitle="People, attendance & payroll"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <HrConsole />
    </DashShell>
  );
}
