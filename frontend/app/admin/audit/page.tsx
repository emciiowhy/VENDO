"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { AuditTrail } from "../../components/admin/AuditTrail";

/**
 * Super Admin — Audit Trail. The accountability ledger for privileged
 * control-plane actions (plan/status changes, broadcasts, profile edits).
 * SUPER_ADMIN only.
 */
export default function AdminAuditPage() {
  return (
    <DashShell
      title="Audit Trail"
      subtitle="Every privileged platform action, on the record"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <AuditTrail />
    </DashShell>
  );
}
