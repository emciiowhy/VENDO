"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { SalesLedger } from "../../components/dash/SalesLedger";

/**
 * Merchant — Sales ledger. Every transaction the registers rang up, with a
 * per-sale bento record (items and quantities, date and time, payment, VAT,
 * refunds). Store management only; tenant-scoped server-side.
 */
export default function SalesPage() {
  return (
    <DashShell
      title="Sales"
      subtitle="Every transaction"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <SalesLedger />
    </DashShell>
  );
}
