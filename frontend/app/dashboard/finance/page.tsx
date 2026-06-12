"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { FinanceConsole } from "../../components/finance/FinanceConsole";

/**
 * Merchant — Finance (P&L). Owners/managers see live POS revenue set against
 * the operating expenses they record, with a monthly profit trend and expense
 * mix. Tenant-scoped server-side.
 */
export default function FinancePage() {
  return (
    <DashShell
      title="Finance"
      subtitle="Profit & loss — revenue vs. expenses"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <FinanceConsole />
    </DashShell>
  );
}
