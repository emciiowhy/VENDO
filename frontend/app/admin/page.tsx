"use client";

import { DashShell } from "../components/dash/DashShell";
import { ADMIN_NAV } from "../components/admin/adminNav";
import { MetricsBento } from "../components/admin/MetricsBento";
import { PlatformShortcuts } from "../components/admin/PlatformShortcuts";

/**
 * Super Admin — Platform Overview. The ecosystem pulse: headline scalars across
 * all tenants plus quick routes into the deeper consoles. The full store
 * directory lives on its own page (/admin/tenants) so the two are distinct:
 * Overview answers "how is the platform doing?", Tenants answers "manage this
 * store". SUPER_ADMIN only.
 */
export default function AdminPage() {
  return (
    <DashShell
      title="Platform Overview"
      subtitle="Ecosystem command center — metrics & health across all tenants"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <div className="space-y-7 max-w-[1180px]">
        <MetricsBento />
        <PlatformShortcuts />
      </div>
    </DashShell>
  );
}
