import Link from "next/link";
import { Icon, type IconName } from "../Icon";

/**
 * The Overview launchpad — distinct from the Tenants directory. Where Tenants is
 * the operational table (search, manage one store at a time), Overview is the
 * platform pulse: headline scalars (MetricsBento, rendered above this) plus
 * quick routes into the deeper consoles. Every tile is the same affordance, so
 * every tile gets the same treatment — colour reveals on hover rather than
 * being sprinkled for decoration.
 */
const LINKS: { icon: IconName; label: string; desc: string; href: string }[] = [
  {
    icon: "building",
    label: "Tenants directory",
    desc: "Browse, search & manage every store environment.",
    href: "/admin/tenants",
  },
  {
    icon: "peso",
    label: "Billing & MRR",
    desc: "Recurring revenue, plan mix & fee growth.",
    href: "/admin/billing",
  },
  {
    icon: "activity",
    label: "System Health",
    desc: "Live telemetry, pool load & variance flags.",
    href: "/admin/health",
  },
  {
    icon: "users",
    label: "Leads & Provisioning",
    desc: "Review demo requests, promote to tenants.",
    href: "/admin/leads",
  },
];

export function PlatformShortcuts() {
  return (
    <div>
      <h3 className="text-title font-extrabold mb-3">Jump to</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group rounded-xl2 bg-surface hairline shadow-card p-5 hover:hairline-strong hover:shadow-soft transition duration-150"
          >
            <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-brand-50 text-brand-600 transition duration-150 group-hover:bg-brand-500 group-hover:text-white">
              <Icon name={l.icon} className="w-5 h-5" strokeWidth={1.6} />
            </span>
            <div className="mt-3 font-bold tracking-tight flex items-center gap-1.5">
              {l.label}
              <Icon
                name="arrow"
                className="w-4 h-4 text-ink-faint group-hover:text-brand-600 group-hover:translate-x-0.5 transition"
                strokeWidth={1.8}
              />
            </div>
            <div className="text-note text-ink-soft">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
