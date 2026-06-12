"use client";

import { DashShell } from "../components/dash/DashShell";
import { MERCHANT_NAV } from "../components/dash/merchantNav";
import { MerchantHome } from "../components/dash/MerchantHome";

/**
 * Merchant store dashboard for owners and managers (a single Tenant scope).
 * Cashiers land on /pos instead, so they're not allowed here.
 */
export default function DashboardPage() {
  return (
    <DashShell
      title="Store Dashboard"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <MerchantHome />
    </DashShell>
  );
}
