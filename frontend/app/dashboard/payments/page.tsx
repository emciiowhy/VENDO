"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { PaymentQrManager } from "../../components/dash/PaymentQrManager";

/**
 * Merchant — Checkout QR codes. Owners/managers upload their real GCash / Maya /
 * QRPH scan-to-pay images, which the POS then shows to customers at checkout.
 * Tenant-scoped server-side.
 */
export default function PaymentsPage() {
  return (
    <DashShell
      title="Checkout QR"
      subtitle="Upload your GCash, Maya & QRPH scan-to-pay codes"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <PaymentQrManager />
    </DashShell>
  );
}
