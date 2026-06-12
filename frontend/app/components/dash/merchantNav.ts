import type { NavGroup } from "./DashShell";

/**
 * Sidebar for the Merchant workspace (owners/managers). Shared by every
 * /dashboard route so the active item highlights correctly as you navigate.
 * All five ERP pillars (Finance, Procurement, Manufacturing, HR, CRM) are now
 * live alongside the core POS/Inventory tools — nothing is "soon" anymore.
 */
export const MERCHANT_NAV: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", icon: "home", href: "/dashboard" },
      { label: "Point of Sale", icon: "pos", href: "/pos" },
      { label: "Inventory", icon: "box", href: "/dashboard/inventory" },
      { label: "Checkout QR", icon: "wallet", href: "/dashboard/payments" },
      { label: "Compliance", icon: "file", href: "/dashboard/compliance" },
    ],
  },
  {
    heading: "Modules",
    items: [
      { label: "Finance", icon: "chart", href: "/dashboard/finance" },
      { label: "Procurement", icon: "truck", href: "/dashboard/procurement" },
      { label: "Manufacturing", icon: "factory", href: "/dashboard/manufacturing" },
      { label: "HR", icon: "users", href: "/dashboard/hr" },
      { label: "CRM", icon: "heart", href: "/dashboard/crm" },
    ],
  },
  {
    items: [
      { label: "Cashiers", icon: "users", href: "/dashboard/staff" },
      { label: "Account", icon: "gear", href: "/dashboard/account" },
    ],
  },
];
