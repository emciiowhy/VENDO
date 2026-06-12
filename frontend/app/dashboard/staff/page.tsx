"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { StaffMatrix } from "../../components/dash/StaffMatrix";

/**
 * Merchant — Staff & cashier PINs. Owner-only: set or reset cashier PINs and
 * action pending forgot-PIN requests. Tenant-scoped server-side.
 */
export default function StaffPage() {
  return (
    <DashShell
      title="Cashiers"
      subtitle="Add, edit and remove cashiers, set their PINs, and resolve reset requests"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER"]}
    >
      <StaffMatrix />
    </DashShell>
  );
}
