"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { HealthMatrix } from "../../components/admin/HealthMatrix";

/**
 * Super Admin — Real-Time System Health. A live SSE telemetry view: the
 * cross-tenant activity ticker and NeonDB pool / latency vitals. SUPER_ADMIN
 * only (the stream itself is fenced server-side).
 */
export default function AdminHealthPage() {
  return (
    <DashShell
      title="System Health"
      subtitle="Live cross-tenant telemetry & infrastructure vitals"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <HealthMatrix />
    </DashShell>
  );
}
