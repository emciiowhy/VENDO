"use client";

import { DashShell } from "../../components/dash/DashShell";
import { MERCHANT_NAV } from "../../components/dash/merchantNav";
import { ProductManagement } from "../../components/inventory/ProductManagement";

/**
 * Merchant Inventory & Category CRUD Matrix. Owners and managers only — the
 * catalog it shows is scoped to their Tenant by the backend session.
 */
export default function InventoryPage() {
  return (
    <DashShell
      title="Product Management"
      subtitle="Products, categories, prices, stock & stock history"
      brandSub="Merchant Workspace"
      nav={MERCHANT_NAV}
      allow={["MERCHANT_OWNER", "MANAGER"]}
    >
      <ProductManagement />
    </DashShell>
  );
}
