import type { Metadata } from "next";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata: Metadata = {
  title: "Careers — VendoPOS",
  description:
    "Help us solve complex distributed retail challenges. We're hiring engineers to build a multi-tenant POS + ERP platform with typesafe codebases, zero-warning compilations, and product-led velocity.",
  openGraph: {
    title: "Careers at VendoPOS — Solve complex distributed retail challenges",
    description:
      "We're hiring engineers to build a multi-tenant POS + ERP platform for the Philippines.",
    type: "website",
  },
};

/** Culture badges — the non-negotiables of how we ship. */
const CULTURE: { icon: IconName; label: string; blurb: string }[] = [
  {
    icon: "shield",
    label: "Typesafe Codebases",
    blurb: "Strict TypeScript end to end. The compiler is the first reviewer.",
  },
  {
    icon: "check",
    label: "Zero-Warning Compilations",
    blurb: "Green builds only. Warnings are bugs we haven't named yet.",
  },
  {
    icon: "bolt",
    label: "Product-Led Velocity",
    blurb: "Small teams, short feedback loops, real merchants in the room.",
  },
];

/** Open roles list. */
const ROLES: {
  title: string;
  tags: string[];
  summary: string;
  points: string[];
}[] = [
  {
    title: "Full-Stack / Backend Engineer",
    tags: ["Engineering", "Full-time", "Remote (PH)"],
    summary:
      "Own the systems that keep multi-tenant commerce correct under load — where a dropped write isn't a bug report, it's a merchant's missing day of sales.",
    points: [
      "Design tenant-isolated services with hard data and compute boundaries",
      "Guarantee transaction rollback safety across the sales and finance ledger",
      "Build offline-capable sync that resolves conflicts without losing a sale",
    ],
  },
  {
    title: "UI/UX Frontend Engineer",
    tags: ["Design Engineering", "Full-time", "Remote (PH)"],
    summary:
      "Turn dense operational data into interfaces a cashier can run at 8AM rush and an owner can read at midnight — fast, legible, and calm.",
    points: [
      "Craft high-retention, HCI-grounded layouts for POS and back-office",
      "Own and evolve the semantic design token system across light and dark",
      "Ship accessible, keyboard-first flows that hold up on real counter hardware",
    ],
  },
];

const CAREERS_EMAIL = "careers@vendopos.app";

export default function CareersPage() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_420px_at_50%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1000px] mx-auto px-6 py-20 md:py-28 text-center">
            <div className="reveal inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              <Icon name="users" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">Careers</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[20ch] text-[clamp(2.3rem,5vw,3.5rem)] leading-[1.04] font-extrabold tracking-tightest text-ink">
              Help us solve complex distributed retail challenges.
            </h1>
            <p className="reveal mt-6 mx-auto max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-soft">
              We&rsquo;re a small, senior team building the multi-tenant POS + ERP that thousands of
              Filipino businesses run on. The problems are real: isolation, correctness under load,
              and offline resilience at the counter. If that sounds like your kind of hard, read on.
            </p>
          </div>
        </section>

        {/* Culture badges */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20">
            <div className="reveal text-center">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                How we work
              </span>
              <h2 className="mt-3 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-extrabold tracking-tightest text-ink">
                The non-negotiables of our craft.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {CULTURE.map((c, i) => (
                <div
                  key={c.label}
                  className="reveal rounded-2xl bg-paper hairline p-6"
                  style={{ transitionDelay: `${i * 70}ms` }}
                >
                  <div className="inline-flex items-center gap-2.5 rounded-full bg-surface hairline px-3 py-1.5">
                    <Icon name={c.icon} className="w-4 h-4 text-brand-600" strokeWidth={1.9} />
                    <span className="text-[13px] font-bold tracking-tight text-ink">{c.label}</span>
                  </div>
                  <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-soft">{c.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Open roles */}
        <section className="bg-paper">
          <div className="max-w-[1000px] mx-auto px-6 py-20 md:py-24">
            <div className="reveal flex items-end justify-between gap-4">
              <div>
                <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                  Open roles
                </span>
                <h2 className="mt-3 text-[clamp(1.7rem,3vw,2.2rem)] leading-tight font-extrabold tracking-tightest text-ink">
                  Roles we&rsquo;re hiring for.
                </h2>
              </div>
              <span className="hidden sm:inline-flex items-center gap-2 text-[13px] font-semibold text-ink-faint">
                <span className="w-2 h-2 rounded-full bg-accent-500" />
                Actively interviewing
              </span>
            </div>

            <div className="reveal mt-9 rounded-2xl bg-surface hairline shadow-soft overflow-hidden">
              {ROLES.map((role, i) => (
                <a
                  key={role.title}
                  href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent(`Application: ${role.title}`)}`}
                  className={
                    "group block px-6 sm:px-8 py-7 hover:bg-paper transition duration-200" +
                    (i > 0 ? " hairline-t" : "")
                  }
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-8">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[1.22rem] font-extrabold tracking-tight text-ink group-hover:text-brand-600 transition">
                        {role.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] font-semibold text-ink-faint">
                        {role.tags.map((t, ti) => (
                          <span key={t} className="inline-flex items-center gap-2.5">
                            {ti > 0 && <span className="w-1 h-1 rounded-full bg-ink-faint" />}
                            {t}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3.5 text-[0.98rem] leading-relaxed text-ink-soft max-w-[60ch]">
                        {role.summary}
                      </p>
                      <ul className="mt-4 space-y-2">
                        {role.points.map((pt) => (
                          <li key={pt} className="flex items-start gap-2.5 text-[13.5px] text-ink">
                            <Icon
                              name="check"
                              className="w-4 h-4 mt-0.5 text-accent-600 shrink-0"
                              strokeWidth={2.2}
                            />
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <span className="inline-flex items-center gap-1.5 self-start rounded-[10px] bg-surface hairline px-4 py-2.5 text-[13.5px] font-semibold text-ink group-hover:border-brand-200 group-hover:text-brand-600 transition shrink-0">
                      Apply
                      <Icon
                        name="arrow"
                        className="w-4 h-4 group-hover:translate-x-0.5 transition"
                        strokeWidth={1.9}
                      />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="bg-surface hairline-t">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                  Don&rsquo;t see your role?
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  We&rsquo;re always glad to meet exceptional engineers who care about correctness and
                  craft. Tell us what you&rsquo;d want to build.
                </p>
              </div>
              <a
                href={`mailto:${CAREERS_EMAIL}?subject=${encodeURIComponent("Open application")}`}
                className="relative inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:bg-white/90 transition shrink-0"
              >
                Introduce yourself
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
