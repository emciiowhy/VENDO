"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { InventoryMatrix } from "../../components/inventory/InventoryMatrix";

/**
 * Merchant Inventory & Category CRUD Matrix. Owners and managers only — the
 * catalog it shows is scoped to their Tenant by the backend session.
 */
export default function InventoryPage() {
  return (
    <DashShell
      title="Inventory"
      subtitle="Items, categories & stock levels"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <InventoryMatrix />
    </DashShell>
  );
}
