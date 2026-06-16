"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { FeatureGate } from "../../components/FeatureGate";
import { ProcurementConsole } from "../../components/procurement/ProcurementConsole";

/**
 * Merchant — Procurement. Owners/managers manage suppliers and purchase orders;
 * receiving a PO restocks Inventory. Tenant-scoped server-side.
 */
export default function ProcurementPage() {
  return (
    <DashShell
      title="Procurement"
      subtitle="Suppliers & purchase orders"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <FeatureGate feature="procurement_supply_chain">
        <ProcurementConsole />
      </FeatureGate>
    </DashShell>
  );
}
