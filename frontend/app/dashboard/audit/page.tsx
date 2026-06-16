"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { AuditConsole } from "../../components/dash/AuditConsole";

/**
 * Merchant — POS terminal audit log. Owners/managers review the sensitive
 * shop-floor actions (cart voids, cancelled sales, drawer pops) captured by the
 * register for cashier accountability. Tenant-scoped server-side.
 */
export default function AuditPage() {
  return (
    <DashShell
      title="Audit log"
      subtitle="Cashier accountability"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <AuditConsole />
    </DashShell>
  );
}
