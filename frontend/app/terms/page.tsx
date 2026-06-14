import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata: Metadata = {
  title: "Terms of Service — VendoPOS",
  description:
    "The operating agreement for the VendoPOS cloud-based retail and restaurant ERP platform — account provisioning, 14-day trial gates, multi-tenant responsibilities, and data export policies.",
  openGraph: {
    title: "Terms of Service — VendoPOS",
    description:
      "Account provisioning, automated trial expiration gates, multi-tenant responsibilities, and termination & data export policies for the VendoPOS platform.",
    type: "website",
  },
};

const EFFECTIVE_DATE = "June 14, 2026";
const GOVERNING_LAW = "Republic of the Philippines";

type Section = {
  id: string;
  title: string;
  lead: string;
  /** A flat clause list. Mutually exclusive with `split`. */
  points?: string[];
  /** Shared-responsibility two-column split (us vs. the merchant). */
  split?: {
    ours: { heading: string; icon: IconName; points: string[] };
    yours: { heading: string; icon: IconName; points: string[] };
  };
};

const SECTIONS: Section[] = [
  {
    id: "acceptance",
    title: "Acceptance of These Terms",
    lead: "By provisioning a tenant or using any part of the VendoPOS platform, the merchant account owner accepts this agreement on behalf of their business. If you are accepting for an organisation, you confirm you are authorised to bind it.",
    points: [
      "These terms govern the cloud-based POS and ERP services, dashboards, and APIs we provide.",
      "We may update the terms with reasonable notice; continued use after the effective date constitutes acceptance.",
    ],
  },
  {
    id: "provisioning",
    title: "Account Provisioning & 14-Day Trial",
    lead: "Signing up provisions an isolated tenant automatically — no manual onboarding required. New tenants begin on a 14-day evaluation period with full platform access.",
    points: [
      "An automated expiration gate restricts write operations (new sales, edits, exports) once the 14-day trial ends, while leaving existing data readable.",
      "Selecting a paid plan before or after expiry lifts the gate immediately and preserves all trial data.",
      "No payment instrument is charged without an explicit upgrade — the trial never auto-converts silently.",
      "Tenants left ungated and unpaid beyond the grace window are scheduled for archival and eventual deletion.",
    ],
  },
  {
    id: "responsibilities",
    title: "Multi-Tenant Responsibilities",
    lead: "VendoPOS runs a shared, multi-tenant platform. Reliability is a partnership: we operate the system, and each merchant owns the operational inputs that drive their own business.",
    split: {
      ours: {
        heading: "What VendoPOS guarantees",
        icon: "shield",
        points: [
          "Platform uptime targets, with monitored availability and incident response.",
          "Hard tenant isolation, encrypted storage, and routine backups.",
          "Security patching, and gapless BIR-aligned invoice sequencing.",
        ],
      },
      yours: {
        heading: "What the merchant owns",
        icon: "store",
        points: [
          "Accuracy of operational pricing, tax settings, and product data you enter.",
          "Safeguarding staff PINs, owner credentials, and role assignments.",
          "Lawful, accurate use of the customer data you capture at the register.",
        ],
      },
    },
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use",
    lead: "The platform is provided for the lawful operation of retail and restaurant businesses. Misuse that threatens the integrity of the shared system is not permitted.",
    points: [
      "No attempt to breach tenant isolation, probe other tenants, or circumvent access controls.",
      "No reverse engineering, resale, or use of the service to build a competing product.",
      "No unlawful, fraudulent, or infringing content processed through the platform.",
    ],
  },
  {
    id: "billing",
    title: "Fees & Billing",
    lead: "Paid plans are billed in advance on the cycle selected at upgrade. Fees are stated in Philippine peso unless otherwise agreed.",
    points: [
      "Subscriptions renew automatically until cancelled; cancellation stops the next renewal.",
      "Plan changes take effect on the next cycle, with prorated adjustments where applicable.",
      "Overdue accounts may be gated to read-only access until the balance is settled.",
    ],
  },
  {
    id: "termination",
    title: "Termination & Data Export",
    lead: "A merchant may cancel at any time; either party may terminate for material breach. Your data remains yours, and we give you a clear path to take it with you.",
    points: [
      "Before deletion, you may export your structured records (sales, inventory, customers, finance) in standard CSV format.",
      "A defined grace period follows cancellation during which export remains available.",
      "After the grace period, tenant data is purged from active systems, and backups age out on a rolling cycle.",
    ],
  },
  {
    id: "liability",
    title: "Liability & Governing Law",
    lead: `The service is provided on an "as available" basis to the extent permitted by law. This agreement is governed by the laws of the ${GOVERNING_LAW}.`,
    points: [
      "Our aggregate liability is limited to the fees paid for the service in the preceding twelve months.",
      "Neither party is liable for indirect or consequential loss arising from use of the platform.",
      "Disputes are resolved under Philippine law, with venue in the courts of Cebu City.",
    ],
  },
];

export default function TermsPage() {
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
              <Icon name="file" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">
                Terms of Service
              </span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[18ch] text-[clamp(2.3rem,5vw,3.5rem)] leading-[1.04] font-extrabold tracking-tightest text-ink">
              Terms of Service
            </h1>
            <p className="reveal mt-6 mx-auto max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-soft">
              The operating agreement for our cloud-based retail and restaurant ERP platform.
            </p>
            <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12.5px] font-semibold text-ink-faint">
              <span className="inline-flex items-center gap-2">
                <Icon name="clock" className="w-4 h-4" strokeWidth={1.8} />
                Effective {EFFECTIVE_DATE}
              </span>
              <span className="w-1 h-1 rounded-full bg-ink-faint" />
              <span className="inline-flex items-center gap-2">
                <Icon name="building" className="w-4 h-4" strokeWidth={1.8} />
                Governed by {GOVERNING_LAW} law
              </span>
            </div>
          </div>
        </section>

        {/* Sectioned agreement card */}
        <section className="bg-surface">
          <div className="max-w-[920px] mx-auto px-6 py-16 md:py-20">
            <div className="reveal rounded-2xl bg-surface hairline shadow-soft overflow-hidden">
              {SECTIONS.map((s, i) => (
                <section
                  key={s.id}
                  id={s.id}
                  className={"scroll-mt-24 px-6 sm:px-9 py-9" + (i > 0 ? " hairline-t" : "")}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid place-items-center w-8 h-8 rounded-[10px] bg-ink text-white text-[13px] font-bold tabular-nums shrink-0">
                      {i + 1}
                    </span>
                    <h2 className="text-[1.25rem] md:text-[1.4rem] font-extrabold tracking-tight text-ink">
                      {s.title}
                    </h2>
                  </div>
                  <p className="mt-4 text-[1rem] leading-relaxed text-ink-soft max-w-[68ch]">
                    {s.lead}
                  </p>

                  {s.points && (
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
                  )}

                  {s.split && (
                    <div className="mt-6 grid md:grid-cols-2 gap-4">
                      {[s.split.ours, s.split.yours].map((col, ci) => (
                        <div key={col.heading} className="rounded-xl bg-paper hairline p-5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={
                                "grid place-items-center w-9 h-9 rounded-[11px] hairline " +
                                (ci === 0
                                  ? "bg-accent-50 text-accent-600"
                                  : "bg-brand-50 text-brand-600")
                              }
                            >
                              <Icon name={col.icon} className="w-[18px] h-[18px]" strokeWidth={1.8} />
                            </span>
                            <h3 className="text-[0.95rem] font-bold tracking-tight text-ink">
                              {col.heading}
                            </h3>
                          </div>
                          <ul className="mt-4 space-y-2.5">
                            {col.points.map((pt) => (
                              <li
                                key={pt}
                                className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-soft"
                              >
                                <Icon
                                  name="check"
                                  className={
                                    "w-3.5 h-3.5 mt-1 shrink-0 " +
                                    (ci === 0 ? "text-accent-600" : "text-brand-600")
                                  }
                                  strokeWidth={2.4}
                                />
                                {pt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>

            {/* Questions CTA */}
            <div className="reveal mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-paper hairline px-6 sm:px-8 py-6">
              <div>
                <h2 className="text-[1.05rem] font-bold tracking-tight text-ink">
                  Questions about these terms?
                </h2>
                <p className="mt-1 text-[0.95rem] text-ink-soft">
                  Our team can walk you through provisioning, billing, or data export.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 self-start sm:self-auto bg-ink text-white font-semibold text-[14px] px-5 py-3 rounded-[11px] hover:bg-black transition shrink-0"
              >
                Talk to us
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
