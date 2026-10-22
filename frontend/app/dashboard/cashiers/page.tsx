"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { CashiersWorkspace } from "../../components/cashiers/CashiersWorkspace";

/**
 * Merchant — Cashiers. Till logins & PINs (any tier) and each cashier's hours
 * from Shift In / Shift Out (Attendance, Business+). Owner only, as the
 * /api/v1/staff router enforces. Tenant-scoped server-side.
 */
export default function CashiersPage() {
  return (
    <DashShell
      title="Cashiers"
      subtitle="Till logins, PINs & hours worked"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER"]}
    >
      <CashiersWorkspace />
    </DashShell>
  );
}
