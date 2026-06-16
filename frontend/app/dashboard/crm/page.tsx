"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { FeatureGate } from "../../components/FeatureGate";
import { CrmConsole } from "../../components/crm/CrmConsole";

/**
 * Merchant — CRM. Owners/managers manage the customer book; spend, visits and
 * loyalty derive from POS sales attached at checkout. Tenant-scoped server-side.
 */
export default function CrmPage() {
  return (
    <DashShell
      title="CRM"
      subtitle="Customers & loyalty"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <FeatureGate feature="customer_relationship_crm">
        <CrmConsole />
      </FeatureGate>
    </DashShell>
  );
}
