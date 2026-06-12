"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { AccountConsole } from "../../components/account/AccountConsole";

/**
 * Merchant — Account hub. The owner/manager manages their profile, the store's
 * identity (used on receipts, invoices and the customer display), receipt
 * customization, sign-in security + active device sessions, workspace
 * preferences, and data export / store deactivation.
 */
export default function AccountPage() {
  return (
    <DashShell
      title="Account"
      subtitle="Your profile, store identity, security and preferences"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <AccountConsole />
    </DashShell>
  );
}
