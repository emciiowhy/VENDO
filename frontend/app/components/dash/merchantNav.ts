import type { NavGroup } from "./DashShell";

/**
 * Sidebar for the Merchant workspace (owners/managers). Shared by every
 * /dashboard route so the active item highlights correctly as you navigate.
 * The ERP modules (Finance, People & Payroll, CRM) sit beside the core POS and
 * Product Management tools.
 * Procurement and Manufacturing are retired (their old URLs redirect).
 */
export const MERCHANT_NAV: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", icon: "home", href: "/dashboard" },
      { label: "Summary", icon: "chart", href: "/dashboard/summary" },
      { label: "Point of Sale", icon: "pos", href: "/pos" },
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
      { label: "People & Payroll", icon: "users", href: "/dashboard/hr", feature: "human_resources_payroll" },
      { label: "CRM", icon: "heart", href: "/dashboard/crm", feature: "customer_relationship_crm" },
    ],
  },
  {
    items: [
      { label: "Cashiers", icon: "users", href: "/dashboard/staff" },
      { label: "Activity log", icon: "shield", href: "/dashboard/audit" },
      { label: "My record", icon: "clock", href: "/me" },
      { label: "Account", icon: "gear", href: "/dashboard/account" },
    ],
  },
];
