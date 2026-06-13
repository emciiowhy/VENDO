"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { ComplianceMatrix } from "../../components/admin/ComplianceMatrix";

/**
 * Super Admin — Platform Compliance Oversight. Every active Tenant's serialized
 * output-VAT position for a filing period, with a consolidated CSV for
 * remittance reconciliation. SUPER_ADMIN only (enforced again server-side on
 * every endpoint).
 */
export default function AdminCompliancePage() {
  return (
    <DashShell
      title="Compliance"
      subtitle="Platform-wide BIR output-VAT oversight across all tenants"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <ComplianceMatrix />
    </DashShell>
  );
}
