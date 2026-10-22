"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { AuditConsole } from "../../components/dash/AuditConsole";
import { ShiftDiscrepancyMatrix } from "../../components/hr/ShiftDiscrepancyMatrix";

/**
 * Merchant — POS terminal audit log. Owners/managers review the sensitive
 * shop-floor actions (cart voids, cancelled sales, drawer pops) captured by the
 * register for cashier accountability. Tenant-scoped server-side.
 */
export default function AuditPage() {
  return (
    <DashShell
      title="Activity log"
      subtitle="Staff accountability"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <AuditConsole />
      {/* Cash-drawer reconciliation (X/Z-Read variance) — the POS side of staff
          accountability, so it lives here rather than in Cashiers. */}
      <div className="mt-10 max-w-[1180px] space-y-4">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Drawer audit</h2>
          <p className="text-[13.5px] text-ink-soft">
            Every closed cash-drawer shift with its Z-Read variance — counted cash vs. what the drawer should hold.
          </p>
        </div>
        <ShiftDiscrepancyMatrix />
      </div>
    </DashShell>
  );
}
