import type { NavGroup } from "./DashShell";

/**
 * Sidebar for the Merchant workspace (owners/managers). Shared by every
 * /dashboard route so the active item highlights correctly as you navigate.
 * The ERP modules (Finance, Cashiers, CRM) sit beside the core POS and
 * Product Management tools.
 * Procurement and Manufacturing are retired (their old URLs redirect).
 */
export const MERCHANT_NAV: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", icon: "home", href: "/dashboard" },
      { label: "Summary", icon: "chart", href: "/dashboard/summary" },
      { label: "Point of Sale", icon: "pos", href: "/pos" },
      { label: "Sales", icon: "receipt", href: "/dashboard/sales" },
      { label: "Product Management", icon: "box", href: "/dashboard/inventory" },
      { label: "Checkout QR", icon: "wallet", href: "/dashboard/payments" },
      { label: "Compliance", icon: "file", href: "/dashboard/compliance" },
    ],
  },
  {
    heading: "Modules",
    // Each carries its gating `feature`: below the required tier the sidebar link
    // renders locked (muted + lock badge) and the page shows the upgrade card.
    items: [
      { label: "Finance", icon: "chart", href: "/dashboard/finance", feature: "finance_accounting" },
      // No sidebar lock: the cashier roster is open on any tier; the page gates
      // its Attendance tab itself.
      { label: "Cashiers", icon: "users", href: "/dashboard/cashiers" },
      { label: "CRM", icon: "heart", href: "/dashboard/crm", feature: "customer_relationship_crm" },
    ],
  },
  {
    items: [
      { label: "Activity log", icon: "shield", href: "/dashboard/audit" },
      { label: "Account", icon: "gear", href: "/dashboard/account" },
    ],
  },
];
