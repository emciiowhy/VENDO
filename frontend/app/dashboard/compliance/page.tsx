"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { ComplianceTray } from "../../components/dash/ComplianceTray";

/**
 * Merchant — BIR Compliance & Audit Tray. Browse the store's serialized monthly
 * sales ledger and export it as a tax-prep CSV. Owners/managers only; the
 * ledger is tenant-scoped server-side from the session.
 */
export default function CompliancePage() {
  return (
    <DashShell
      title="BIR Compliance"
      subtitle="Serialized monthly sales ledger, VAT breakdown & CSV export"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <ComplianceTray />
    </DashShell>
  );
}
