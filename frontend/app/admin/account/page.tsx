"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { AdminAccount } from "../../components/admin/AdminAccount";

/**
 * Super Admin — Account. The platform operator's own profile + security hub.
 * SUPER_ADMIN only.
 */
export default function AdminAccountPage() {
  return (
    <DashShell
      title="Account"
      subtitle="Your profile & sign-in security"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <AdminAccount />
    </DashShell>
  );
}
