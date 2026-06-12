"use client";

import { DashShell } from "../../components/dash/DashShell";
import { ADMIN_NAV } from "../../components/admin/adminNav";
import { BillingMatrix } from "../../components/admin/BillingMatrix";

/**
 * Super Admin — Billing & MRR Engine. Platform-wide recurring-revenue metrics
 * and the transaction-fee trend, computed live on the backend. SUPER_ADMIN only
 * (enforced again server-side on every endpoint).
 */
export default function AdminBillingPage() {
  return (
    <DashShell
      title="Billing & MRR"
      subtitle="Platform recurring revenue, plan mix & transaction-fee growth"
      brandSub="Platform Console"
      nav={ADMIN_NAV}
      allow={["SUPER_ADMIN"]}
    >
      <BillingMatrix />
    </DashShell>
  );
}
