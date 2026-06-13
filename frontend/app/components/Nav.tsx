"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { BrandMark } from "./BrandMark";

/**
 * Marketing top-nav with mega-menu dropdowns. Server-rendered shell, but
 * interactive (hover/click to open, Escape + outside-click to close, mobile
 * drawer) so it's a client component. All panels are driven by the data below,
 * themed purely with ink/surface tokens so they read correctly in Light & Dark.
 *
 * Feature/industry/hardware links point at the relevant on-page section so a
 * click still scrolls somewhere meaningful on the single-page landing site.
 */

interface MenuLink {
  label: string;
  href: string;
  /** Optional leading icon (used by the grouped Industry menu). */
  icon?: IconName;
}

interface MenuGroup {
  /** Eyebrow heading above the group. */
  title: string;
  icon: IconName;
  /** When true the eyebrow divider uses the accent rule (per the design). */
  accent?: boolean;
  links: MenuLink[];
}

interface MenuDef {
  key: string;
  label: string;
  /** Multi-column mega panel (Products) vs. a single tidy column. */
  columns: MenuGroup[][];
  /** Optional full-width footer link, e.g. "View all industries". */
  footer?: { label: string; href: string };
}

const INDUSTRY: MenuDef = {
  key: "industry",
  label: "Industry",
  footer: { label: "View all industries", href: "/industry" },
  columns: [
    [
      {
        title: "F&B Business",
        icon: "store",
        links: [
          { label: "Cafés & Bakeries", href: "/industry/cafes-bakeries", icon: "store" },
          { label: "Restaurants", href: "/industry/restaurants", icon: "receipt" },
          { label: "Quick Serve", href: "/industry/quick-serve", icon: "bolt" },
          { label: "Fine Dining & Specialty", href: "/industry/fine-dining", icon: "heart" },
          { label: "Cloud Kitchen & Delivery Only", href: "/industry/cloud-kitchen", icon: "truck" },
        ],
      },
    ],
    [
      {
        title: "Retail Business",
        icon: "cart",
        accent: true,
        links: [
          { label: "Grocery & Supermarket", href: "/industry/grocery-supermarket", icon: "cart" },
          { label: "Convenience Store", href: "/industry/convenience-store", icon: "store" },
          { label: "Fashion & Apparel", href: "/industry/fashion-apparel", icon: "tag" },
          { label: "Specialty Store", href: "/industry/specialty-store", icon: "layers" },
          { label: "Online Store / e-Commerce", href: "/industry/online-store", icon: "monitor" },
        ],
      },
    ],
    [
      {
        title: "Service",
        icon: "heart",
        links: [
          { label: "Personal Care & Salons", href: "/industry/personal-care", icon: "heart" },
          { label: "Healthcare & Pharmacies", href: "/industry/healthcare", icon: "shield" },
        ],
      },
      {
        title: "Enterprise",
        icon: "building",
        accent: true,
        links: [
          { label: "Multi-location & Franchise", href: "/industry/multi-location", icon: "building" },
          { label: "Warehouse & Distribution", href: "/industry/warehouse-logistics", icon: "truck" },
        ],
      },
    ],
  ],
};

const PRODUCTS: MenuDef = {
  key: "products",
  label: "Products",
  footer: { label: "View all products", href: "/products" },
  columns: [
    [
      {
        title: "Seamless Checkouts & Payments",
        icon: "card",
        links: [
          { label: "Point of Sale (POS)", href: "/products/point-of-sale" },
          { label: "Payments", href: "/products/payments" },
        ],
      },
      {
        title: "Run your store smoothly",
        icon: "store",
        accent: true,
        links: [
          { label: "QR Order & Pay", href: "/products/qr-order-and-pay" },
          { label: "BIR-Accreditation", href: "/products/bir-accreditation" },
          { label: "Inventory Management", href: "/products/inventory-management" },
          { label: "Kitchen Display System (KDS)", href: "/products/kitchen-display-system" },
          { label: "Multi Location Management", href: "/products/multi-location-management" },
          { label: "Reporting & Analytics", href: "/products/reporting-and-analytics" },
          { label: "Employee Management", href: "/products/employee-management" },
        ],
      },
    ],
    [
      {
        title: "Back office & operations",
        icon: "layers",
        links: [
          { label: "Finance & P&L", href: "/products/finance" },
          { label: "Procurement", href: "/products/procurement" },
          { label: "Manufacturing", href: "/products/manufacturing" },
        ],
      },
      {
        title: "Customer Loyalty made easy",
        icon: "tag",
        accent: true,
        links: [
          { label: "Loyalty Program", href: "/products/loyalty-program" },
          { label: "Membership", href: "/products/membership" },
          { label: "Engage (CRM / Marketing Automation)", href: "/products/engage-crm" },
          { label: "Customisable Promotions", href: "/products/promotions" },
        ],
      },
    ],
    [
      {
        title: "Reach more customers and sell online",
        icon: "monitor",
        accent: true,
        links: [
          { label: "Online Ordering", href: "/products/online-ordering" },
          { label: "Webstore", href: "/products/webstore" },
          { label: "Marketplace Integration", href: "/products/marketplace-integration" },
          { label: "Takeaway & Pickup", href: "/products/takeaway-and-pickup" },
          { label: "Integrated Logistics", href: "/products/integrated-logistics" },
        ],
      },
    ],
  ],
};

const HARDWARE: MenuDef = {
  key: "hardware",
  label: "Hardware",
  footer: { label: "View all hardware & bundles", href: "/hardware" },
  columns: [
    [
      {
        title: "Front-of-counter gear",
        icon: "pos",
        links: [
          { label: "POS Terminal & Tablet Stand", href: "/hardware/pos-terminal" },
          { label: "Receipt Printer", href: "/hardware/receipt-printer" },
          { label: "Barcode Scanner", href: "/hardware/barcode-scanner" },
          { label: "Cash Drawer", href: "/hardware/cash-drawer" },
        ],
      },
    ],
    [
      {
        title: "Payments & displays",
        icon: "card",
        accent: true,
        links: [
          { label: "Card & QR Payment Reader", href: "/hardware/payment-reader" },
          { label: "Customer Display Screen", href: "/hardware/customer-display" },
          { label: "Kitchen Display Screen", href: "/hardware/kitchen-display-screen" },
          { label: "Label & Sticker Printer", href: "/hardware/label-printer" },
        ],
      },
    ],
  ],
};

const RESOURCES: MenuDef = {
  key: "resources",
  label: "Resources",
  footer: { label: "Browse all resources", href: "/resources" },
  columns: [
    [
      {
        title: "Learn the platform",
        icon: "file",
        links: [
          { label: "Blog", href: "/blog", icon: "file" },
          { label: "How it works", href: "/#how", icon: "activity" },
          { label: "Why PH businesses switch", href: "/#why", icon: "heart" },
          { label: "FAQ", href: "/#faq", icon: "search" },
        ],
      },
    ],
  ],
};

const COMPANY: MenuDef = {
  key: "company",
  label: "Company",
  columns: [
    [
      {
        title: "About VendoPOS",
        icon: "building",
        links: [
          { label: "About Us", href: "/company/about" },
          { label: "Careers", href: "/company/careers" },
          { label: "Contact Us", href: "/company/contact" },
        ],
      },
    ],
  ],
};

const MENUS: MenuDef[] = [INDUSTRY, PRODUCTS, HARDWARE, RESOURCES, COMPANY];

/** One eyebrow + link list block inside a panel. */
function GroupBlock({ group }: { group: MenuGroup }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-ink-faint">
        <Icon name={group.icon} className="w-4 h-4" />
        <span className="text-[11.5px] font-bold tracking-wide uppercase">{group.title}</span>
      </div>
      <div className={`mt-2 h-px ${group.accent ? "bg-brand-500/70" : "bg-ink/10"}`} />
      <ul className="mt-3 space-y-1">
        {group.links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="flex items-center gap-2.5 -mx-2 px-2 py-1.5 rounded-lg text-[14px] font-semibold text-ink hover:bg-paper hover:text-brand-600 transition"
            >
              {l.icon && (
                <Icon name={l.icon} className="w-4 h-4 text-ink-faint shrink-0" strokeWidth={1.7} />
              )}
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Panel width keyed by the number of columns the menu declares. */
const PANEL_WIDTH: Record<number, string> = {
  1: "w-[340px]",
  2: "w-[680px]",
  3: "w-[860px]",
};
const PANEL_GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

/** The dropdown panel rendered under an open menu item. */
function MegaPanel({ menu }: { menu: MenuDef }) {
  const cols = menu.columns.length;
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 z-50 ${PANEL_WIDTH[cols] ?? "w-[680px]"}`}
    >
      <div className="rounded-2xl bg-surface hairline shadow-2xl p-7">
        <div className={`grid gap-x-9 gap-y-7 ${PANEL_GRID[cols] ?? "grid-cols-2"}`}>
          {menu.columns.map((col, ci) => (
            <div key={ci} className="space-y-7">
              {col.map((group) => (
                <GroupBlock key={group.title} group={group} />
              ))}
            </div>
          ))}
        </div>
        {menu.footer && (
          <Link
            href={menu.footer.href}
            className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-paper hairline py-3 text-[13.5px] font-semibold text-ink hover:text-brand-600 transition"
          >
            {menu.footer.label}
            <Icon name="arrow" className="w-4 h-4" strokeWidth={1.8} />
          </Link>
        )}
      </div>
    </div>
  );
}

export function Nav() {
  const [open, setOpen] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Escape closes any open menu; click outside the nav closes the desktop panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(null);
        setMobileOpen(false);
      }
    }
    function onClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  return (
    <header ref={navRef} className="sticky top-0 z-50 glass hairline-b">
      <div className="max-w-[1160px] mx-auto px-6 h-[68px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark className="w-8 h-8" />
          <span className="font-extrabold text-[19px] tracking-tightest">VendoPOS</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-[14.5px] font-semibold text-ink-soft">
          {MENUS.map((menu) => {
            // Insert the standalone Pricing link between Hardware and Resources
            // to mirror the reference layout.
            const pricing =
              menu.key === "resources" ? (
                <Link
                  key="pricing"
                  href="/#pricing"
                  className="px-3 py-2 rounded-lg hover:text-ink transition"
                >
                  Pricing
                </Link>
              ) : null;
            return (
              <span key={menu.key} className="contents">
                {pricing}
                <div
                  className="relative"
                  onMouseEnter={() => setOpen(menu.key)}
                  onMouseLeave={() => setOpen(null)}
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={open === menu.key}
                    onClick={() => setOpen((cur) => (cur === menu.key ? null : menu.key))}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
                      open === menu.key ? "text-ink" : "hover:text-ink"
                    }`}
                  >
                    {menu.label}
                    <Icon
                      name="chevron"
                      className={`w-3.5 h-3.5 transition-transform ${
                        open === menu.key ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open === menu.key && <MegaPanel menu={menu} />}
                </div>
              </span>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center font-semibold text-[14.5px] text-ink-soft hover:text-ink transition"
          >
            Sign in
          </Link>
          <Link
            href="/#demo"
            className="hidden sm:inline-flex items-center gap-2 bg-ink text-white font-semibold text-[14.5px] px-5 py-2.5 rounded-[10px] hover:bg-black transition"
          >
            Request a Demo
          </Link>
          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden grid place-items-center w-10 h-10 rounded-[10px] hairline text-ink"
          >
            <Icon name={mobileOpen ? "x" : "menu"} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t hairline-t bg-surface max-h-[80vh] overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {MENUS.map((menu) => (
              <div key={menu.key}>
                <p className="text-[12px] font-bold tracking-widest uppercase text-ink-faint">
                  {menu.label}
                </p>
                <div className="mt-3 space-y-5">
                  {menu.columns.flat().map((group) => (
                    <div key={group.title}>
                      <div className="flex items-center gap-2 text-ink-faint">
                        <Icon name={group.icon} className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold tracking-wide uppercase">
                          {group.title}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-2 pl-1">
                        {group.links.map((l) => (
                          <li key={l.label}>
                            <Link
                              href={l.href}
                              onClick={() => setMobileOpen(false)}
                              className="block text-[15px] font-semibold text-ink"
                            >
                              {l.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Link
              href="/#pricing"
              onClick={() => setMobileOpen(false)}
              className="block text-[15px] font-bold text-ink"
            >
              Pricing
            </Link>
            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center font-semibold text-[14.5px] py-2.5 rounded-[10px] hairline text-ink"
              >
                Sign in
              </Link>
              <Link
                href="/#demo"
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-center bg-ink text-white font-semibold text-[14.5px] py-2.5 rounded-[10px]"
              >
                Request a Demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
