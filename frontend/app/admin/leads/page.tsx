"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { LeadsMatrix } from "../../components/admin/LeadsMatrix";

/**
 * Super Admin — Leads Management & Tenant Provisioning. The live growth
 * pipeline: incoming demo requests and one-click promotion into an isolated
 * tenant. SUPER_ADMIN only (enforced again server-side on every endpoint).
 */
export default function AdminLeadsPage() {
  return (
    <DashShell
      title="Leads & Provisioning"
      subtitle="Review incoming demo requests and promote them into live tenants"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <LeadsMatrix />
    </DashShell>
  );
}
