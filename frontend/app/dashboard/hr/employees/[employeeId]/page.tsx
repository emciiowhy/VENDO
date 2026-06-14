"use client";

import { use } from "react";
import { DashShell } from "@/app/components/dash/DashShell";
import { MERCHANT_NAV } from "@/app/components/dash/merchantNav";
import { EmployeeProfile } from "@/app/components/hr/EmployeeProfile";

/**
 * Merchant — the deep-dive employee file at /dashboard/hr/employees/[employeeId].
 * Tenant scope still comes from the session cookie (server-side); the URL only
 * carries the employee id. In Next 16 a Client Component page unwraps the async
 * `params` with React's `use()`.
 */
export default function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = use(params);
  return (
    <DashShell
      title="Employee file"
      subtitle="Dossier, attendance & pay"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <EmployeeProfile employeeId={employeeId} />
    </DashShell>
  );
}
