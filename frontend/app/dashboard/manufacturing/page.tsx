"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { FeatureGate } from "../../components/FeatureGate";
import { ManufacturingConsole } from "../../components/manufacturing/ManufacturingConsole";

/**
 * Merchant — Manufacturing. Owners/managers define recipes (BOM) and run
 * production, which consumes component stock and restocks finished goods.
 * Tenant-scoped server-side.
 */
export default function ManufacturingPage() {
  return (
    <DashShell
      title="Manufacturing"
      subtitle="Recipes & production"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <FeatureGate feature="manufacturing_bom">
        <ManufacturingConsole />
      </FeatureGate>
    </DashShell>
  );
}
