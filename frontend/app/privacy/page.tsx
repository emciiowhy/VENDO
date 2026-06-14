import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata: Metadata = {
  title: "Privacy Policy — VendoPOS",
  description:
    "How VendoPOS protects merchant datasets and customer information under the Data Privacy Act of 2012 (RA 10173). We process multi-tenant retail records strictly as a Data Processor.",
  openGraph: {
    title: "Privacy Policy — VendoPOS",
    description:
      "Our role as a Data Processor for multi-tenant retail records, and the strict non-disclosure of consumer transaction histories captured at the register.",
    type: "website",
  },
};

const EFFECTIVE_DATE = "June 14, 2026";
const DPO_EMAIL = "privacy@vendopos.app";
const HQ = "Cebu City, Philippines";
const PHONE = "0915 515 2314";

/** The policy outline — drives both the sticky index and the numbered spine,
 *  so the two can never drift out of sync. */
const SECTIONS: {
  id: string;
  title: string;
  lead: string;
  points: string[];
}[] = [
  {
    id: "role",
    title: "Our Role as a Data Processor",
    lead: "VendoPOS operates as a Data Processor. Each merchant on the platform is the Data Controller of their own retail records — we process those records only on their documented instructions, never for our own ends.",
    points: [
      "Every tenant's dataset is fenced and processed in isolation — one merchant's records are never co-mingled with, or visible to, another's.",
      "We act on the controlling merchant's instructions for the storage, access, and deletion of their data.",
      "Sub-processors are limited to vetted infrastructure providers bound by equivalent data-protection terms.",
    ],
  },
  {
    id: "transactions",
    title: "Consumer Transaction Histories",
    lead: "Transaction histories captured at the register terminal — line items, tendered amounts, and any customer detail a cashier records — are held under strict non-disclosure.",
    points: [
      "Register-level transaction data is bound to the originating tenant and is never sold, rented, or shared across tenants.",
      "We do not use consumer purchase histories for advertising, profiling, or model training.",
      "Access is least-privilege — scoped to the merchant's own authenticated staff and a narrow, fully audited support path.",
    ],
  },
  {
    id: "collect",
    title: "What We Process",
    lead: "We process only the operational data a POS + ERP needs to run a business, and nothing collected for its own sake.",
    points: [
      "Merchant and staff account details — names, roles, and authentication credentials.",
      "Operational records — sales, inventory, suppliers, payroll, and finance entries.",
      "Customer profiles a merchant chooses to keep — contact details and loyalty activity.",
    ],
  },
  {
    id: "basis",
    title: "Lawful Basis & RA 10173",
    lead: "Processing is governed by the Data Privacy Act of 2012 (Republic Act No. 10173) and the issuances of the National Privacy Commission (NPC).",
    points: [
      "Processing rests on the merchant's contract and the legitimate operation of their business.",
      "We uphold the data-subject rights guaranteed by the Act — access, correction, objection, and erasure.",
      "A registered Data Protection Officer oversees compliance, audits, and breach-notification timelines.",
    ],
  },
  {
    id: "retention",
    title: "Retention & Deletion",
    lead: "Records are retained for as long as the merchant's subscription is active, plus any statutory window the law requires us to keep them.",
    points: [
      "Financial and invoice records are retained to meet BIR record-keeping requirements.",
      "On verified request or account closure, tenant data is purged from active systems on a defined schedule.",
      "Backups age out on a rolling cycle and are never used to silently revive deleted records.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_420px_at_50%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1000px] mx-auto px-6 py-20 md:py-24 text-center">
            <div className="reveal inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              <Icon name="lock" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">Privacy Policy</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[18ch] text-[clamp(2.3rem,5vw,3.5rem)] leading-[1.04] font-extrabold tracking-tightest text-ink">
              Privacy Policy
            </h1>
            <p className="reveal mt-6 mx-auto max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-soft">
              Committed to protecting merchant datasets and customer information under RA 10173.
            </p>
            <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12.5px] font-semibold text-ink-faint">
              <span className="inline-flex items-center gap-2">
                <Icon name="clock" className="w-4 h-4" strokeWidth={1.8} />
                Effective {EFFECTIVE_DATE}
              </span>
              <span className="w-1 h-1 rounded-full bg-ink-faint" />
              <span className="inline-flex items-center gap-2">
                <Icon name="shield" className="w-4 h-4" strokeWidth={1.8} />
                Data Privacy Act of 2012
              </span>
            </div>
          </div>
        </section>

        {/* Body — sticky index + numbered policy spine */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20">
            <div className="grid lg:grid-cols-[260px_1fr] gap-10 lg:gap-16">
              {/* Sticky index */}
              <aside className="reveal lg:sticky lg:top-24 lg:self-start">
                <span className="text-[11px] font-bold tracking-widest uppercase text-ink-faint">
                  On this page
                </span>
                <nav className="mt-4 space-y-1">
                  {SECTIONS.map((s, i) => (
                    <a
                      key={s.id}
                      href={`#${s.id}`}
                      className="group flex items-start gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-paper transition"
                    >
                      <span className="mt-0.5 grid place-items-center w-5 h-5 rounded-md bg-brand-50 text-brand-600 text-[11px] font-bold tabular-nums shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-[13.5px] font-semibold text-ink-soft group-hover:text-brand-600 transition leading-snug">
                        {s.title}
                      </span>
                    </a>
                  ))}
                  <a
                    href="#contact"
                    className="group flex items-start gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-paper transition"
                  >
                    <span className="mt-0.5 grid place-items-center w-5 h-5 rounded-md bg-brand-50 text-brand-600 shrink-0">
                      <Icon name="bell" className="w-3 h-3" strokeWidth={2} />
                    </span>
                    <span className="text-[13.5px] font-semibold text-ink-soft group-hover:text-brand-600 transition leading-snug">
                      Contact our DPO
                    </span>
                  </a>
                </nav>
              </aside>

              {/* Numbered spine */}
              <div className="min-w-0">
                <ol className="space-y-0">
                  {SECTIONS.map((s, i) => (
                    <li
                      key={s.id}
                      id={s.id}
                      className={
                        "reveal scroll-mt-24 py-9 first:pt-0" + (i > 0 ? " hairline-t" : "")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-ink text-white text-[13px] font-bold tabular-nums shrink-0">
                          {i + 1}
                        </span>
                        <h2 className="text-[1.3rem] md:text-[1.45rem] font-extrabold tracking-tight text-ink">
                          {s.title}
                        </h2>
                      </div>
                      <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft max-w-[68ch]">
                        {s.lead}
                      </p>
                      <ul className="mt-5 space-y-3">
                        {s.points.map((pt) => (
                          <li
                            key={pt}
                            className="flex items-start gap-3 text-[14.5px] leading-relaxed text-ink max-w-[68ch]"
                          >
                            <Icon
                              name="check"
                              className="w-4 h-4 mt-1 text-accent-600 shrink-0"
                              strokeWidth={2.2}
                            />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>

                {/* DPO contact card */}
                <div
                  id="contact"
                  className="reveal scroll-mt-24 mt-9 relative overflow-hidden rounded-2xl bg-ink text-white p-8 md:p-9"
                >
                  <div
                    aria-hidden="true"
                    className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-brand-500/25 blur-3xl"
                  />
                  <div className="relative">
                    <h2 className="text-[1.3rem] font-extrabold tracking-tight">
                      Reach our Data Protection Officer
                    </h2>
                    <p className="mt-2.5 text-[0.98rem] leading-relaxed text-white/70 max-w-[56ch]">
                      To exercise a data-subject right or raise a privacy concern, contact our DPO.
                      We acknowledge requests within one business day.
                    </p>
                    <dl className="mt-7 grid sm:grid-cols-3 gap-5">
                      {(
                        [
                          { icon: "file", label: "Email", value: DPO_EMAIL },
                          { icon: "building", label: "Headquarters", value: HQ },
                          { icon: "card", label: "Phone", value: PHONE },
                        ] as { icon: IconName; label: string; value: string }[]
                      ).map((d) => (
                        <div key={d.label} className="flex items-start gap-3">
                          <Icon
                            name={d.icon}
                            className="w-[18px] h-[18px] mt-0.5 text-white/55 shrink-0"
                            strokeWidth={1.7}
                          />
                          <div className="min-w-0">
                            <dt className="text-[11px] font-bold tracking-widest uppercase text-white/45">
                              {d.label}
                            </dt>
                            <dd className="mt-0.5 text-[14px] font-semibold text-white/90 break-words">
                              {d.value}
                            </dd>
                          </div>
                        </div>
                      ))}
                    </dl>
                    <Link
                      href="/contact"
                      className="mt-7 inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14px] px-5 py-3 rounded-[11px] hover:bg-white/90 transition"
                    >
                      Contact our team
                      <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
