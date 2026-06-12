import type { NavGroup } from "../dash/DashShell";

/**
 * Super Admin console sidebar. Shared across /admin routes so the active item
 * highlights as you navigate. Leads is now live (the growth pipeline); the
 * other platform sections remain "soon".
 */
export const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { label: "Overview", icon: "grid", href: "/admin" },
      { label: "Tenants", icon: "building", href: "/admin/tenants" },
      { label: "Leads", icon: "users", href: "/admin/leads" },
    ],
  },
  {
    heading: "Platform",
    items: [
      { label: "Billing & MRR", icon: "peso", href: "/admin/billing" },
      { label: "System Health", icon: "activity", href: "/admin/health" },
      { label: "Compliance", icon: "file", href: "/admin", soon: true },
    ],
  },
];
