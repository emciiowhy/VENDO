import Link from "next/link";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Core Tools", href: "/#tools" },
      { label: "Why VendoPOS", href: "/#why" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How it works", href: "/#how" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "/company/about" },
      { label: "Careers", href: "/company/careers" },
      { label: "Contact", href: "/company/contact" },
      { label: "Request a Demo", href: "/#demo" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "#" },
      { label: "Terms of Service", href: "#" },
      { label: "Data & Security", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-ink text-white/60 pt-16 pb-9">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="grid md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-2.5 text-white">
              <span className="w-8 h-8 rounded-[9px] bg-white text-ink grid place-items-center font-extrabold text-[15px]">
                V
              </span>
              <span className="font-extrabold text-[18px] tracking-tightest">VendoPOS</span>
            </div>
            <p className="mt-4 text-[0.92rem] leading-relaxed max-w-[34ch]">
              One multi-tenant POS + ERP platform built for how Filipino businesses actually
              operate.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-white text-[12.5px] font-bold uppercase tracking-widest mb-4">
                {col.title}
              </h4>
              <ul className="space-y-2.5 text-[0.92rem]">
                {col.links.map((link) =>
                  link.href.startsWith("/") ? (
                    <li key={link.label}>
                      <Link href={link.href} className="hover:text-white transition">
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <a href={link.href} className="hover:text-white transition">
                        {link.label}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-7 border-t border-white/10 flex flex-wrap justify-between gap-3 text-[13px]">
          <span>© 2026 VendoPOS. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
