"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { TenantsDirectory } from "../../components/admin/TenantsDirectory";

/**
 * Super Admin — Tenants directory. The operational table: search/filter every
 * store environment and open the per-tenant management controls. Distinct from
 * the Overview launchpad at /admin. SUPER_ADMIN only.
 */
export default function AdminTenantsPage() {
  return (
    <DashShell
      title="Tenants"
      subtitle="Search, inspect & manage every store environment"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <div className="max-w-[1180px]">
        <TenantsDirectory />
      </div>
    </DashShell>
  );
}
