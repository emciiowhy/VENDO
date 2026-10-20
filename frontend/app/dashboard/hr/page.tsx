"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { FeatureGate } from "../../components/FeatureGate";
import { HrConsole } from "../../components/hr/HrConsole";

/**
 * Merchant — HR. Owners/managers manage the employee roster, mark daily
 * attendance from Shift In / Shift Out, and payroll they review and approve.
 * Tenant-scoped server-side.
 */
export default function HrPage() {
  return (
    <DashShell
      title="People & Payroll"
      subtitle="Employees, attendance & payroll"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <FeatureGate feature="human_resources_payroll">
        <HrConsole />
      </FeatureGate>
    </DashShell>
  );
}
