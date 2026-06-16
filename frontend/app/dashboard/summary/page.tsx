"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { OwnerSummaryView } from "../../components/dash/OwnerSummaryView";

/**
 * Merchant — mobile owner summary. A phone-first, single-screen read of the
 * three vital signs (gross sales today, registers open now, low-stock count) for
 * an owner away from the shop. Tenant-scoped server-side.
 */
export default function SummaryPage() {
  return (
    <DashShell
      title="Summary"
      subtitle="Today at a glance"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <OwnerSummaryView />
    </DashShell>
  );
}
