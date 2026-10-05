"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { BroadcastComposer } from "../../components/admin/BroadcastComposer";

/**
 * Super Admin — Platform Broadcast. Compose a notice that fans out to every
 * targeted merchant's notification bell. SUPER_ADMIN only.
 */
export default function AdminBroadcastPage() {
  return (
    <DashShell
      title="Broadcast"
      subtitle="Push a platform-wide notice to merchants"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <BroadcastComposer />
    </DashShell>
  );
}
