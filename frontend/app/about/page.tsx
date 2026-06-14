import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata: Metadata = {
  title: "About Us — VendoPOS",
  description:
    "VendoPOS builds the software that runs local commerce — a multi-tenant POS + ERP engineered around tenant isolation, BIR compliance, and offline-capable resiliency for Filipino businesses.",
  openGraph: {
    title: "About VendoPOS — We build the software that runs local commerce",
    description:
      "A multi-tenant POS + ERP engineered around tenant isolation, BIR compliance, and offline-capable resiliency for Filipino businesses.",
    type: "website",
  },
};

/** Core engineering pillars — the heart of the bento grid. */
const PILLARS: {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  featured?: boolean;
}[] = [
  {
    icon: "shield",
    eyebrow: "Architecture",
    title: "Tenant Isolation",
    body: "Every business runs in its own decoupled, enterprise-grade tenant. Data, configuration, and compute boundaries are enforced by design — not bolted on.",
    points: ["Per-tenant data boundaries", "Decoupled, independently scalable services"],
  },
  {
    icon: "receipt",
    eyebrow: "Philippine-first",
    title: "Compliance Ready",
    body: "Engineered directly around local BIR sequence-integrity controls — gapless invoice numbering, tamper-evident records, and audit trails built into the core, not stapled on at year-end.",
    points: ["Gapless BIR sequence integrity", "Tamper-evident, auditable records"],
    featured: true,
  },
  {
    icon: "bolt",
    eyebrow: "Reliability",
    title: "Operational Resiliency",
    body: "High-performance, offline-capable retail engines keep the counter moving when the network doesn't. Sales sync the moment connectivity returns — no lost transactions.",
    points: ["Offline-capable POS engine", "Conflict-free sync on reconnect"],
  },
];

/** Proof points for the slim credibility strip. */
const STATS: { value: string; label: string }[] = [
  { value: "5", label: "ERP pillars in one platform" },
  { value: "100%", label: "Peso-first & BIR-ready" },
  { value: "1", label: "Login for your whole business" },
];

export default function AboutPage() {
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
              <Icon name="building" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">About VendoPOS</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[18ch] text-[clamp(2.3rem,5vw,3.5rem)] leading-[1.04] font-extrabold tracking-tightest text-ink">
              We build the software that runs local commerce.
            </h1>
            <p className="reveal mt-6 mx-auto max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-soft">
              VendoPOS is one multi-tenant POS + ERP platform for Filipino businesses — sales, stock,
              suppliers, finances, and staff in a single system. We obsess over the unglamorous
              engineering that keeps a counter running: isolation, compliance, and resilience.
            </p>
          </div>
        </section>

        {/* Bento — core pillars */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-20 md:py-24">
            <div className="reveal max-w-[52ch]">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                What we build on
              </span>
              <h2 className="mt-3 text-[clamp(1.7rem,3vw,2.2rem)] leading-tight font-extrabold tracking-tightest text-ink">
                Three pillars, engineered into the core.
              </h2>
            </div>

            {/* Pillar trio — 3 columns on desktop */}
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {PILLARS.map((p, i) =>
                p.featured ? (
                  <article
                    key={p.title}
                    className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-7 flex flex-col shadow-soft"
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 opacity-60"
                      style={{
                        backgroundImage:
                          "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                        backgroundSize: "34px 34px",
                      }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-brand-500/30 blur-3xl"
                    />
                    <div className="relative flex items-center justify-between">
                      <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-white/12">
                        <Icon name={p.icon} className="w-[22px] h-[22px] text-white" strokeWidth={1.7} />
                      </span>
                      <span className="text-[10.5px] font-bold tracking-widest uppercase text-white/70 bg-white/10 rounded-full px-2.5 py-1">
                        {p.eyebrow}
                      </span>
                    </div>
                    <h3 className="relative mt-5 text-[1.3rem] font-extrabold tracking-tight">
                      {p.title}
                    </h3>
                    <p className="relative mt-2.5 text-[0.98rem] leading-relaxed text-white/75 flex-1">
                      {p.body}
                    </p>
                    <ul className="relative mt-5 space-y-2">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2.5 text-[13.5px] text-white/85">
                          <Icon
                            name="check"
                            className="w-4 h-4 mt-0.5 text-accent-500 shrink-0"
                            strokeWidth={2.2}
                          />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  </article>
                ) : (
                  <article
                    key={p.title}
                    className="reveal group rounded-2xl bg-paper hairline p-7 flex flex-col hover:border-brand-200 hover:shadow-soft transition duration-200"
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-brand-50 text-brand-600 hairline">
                        <Icon name={p.icon} className="w-[22px] h-[22px]" strokeWidth={1.7} />
                      </span>
                      <span className="text-[10.5px] font-bold tracking-widest uppercase text-ink-faint">
                        {p.eyebrow}
                      </span>
                    </div>
                    <h3 className="mt-5 text-[1.3rem] font-extrabold tracking-tight text-ink">
                      {p.title}
                    </h3>
                    <p className="mt-2.5 text-[0.98rem] leading-relaxed text-ink-soft flex-1">
                      {p.body}
                    </p>
                    <ul className="mt-5 space-y-2">
                      {p.points.map((pt) => (
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
                  </article>
                ),
              )}
            </div>

            {/* Bento accent row — mission (wide) + a focal metric */}
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <div className="reveal rounded-2xl bg-paper hairline p-7 md:p-9 md:col-span-2 flex flex-col justify-center">
                <h3 className="text-[1.25rem] font-extrabold tracking-tight text-ink">
                  Enterprise-grade shouldn&rsquo;t mean enterprise-only.
                </h3>
                <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-soft max-w-[60ch]">
                  The best operational tools have always been locked behind enterprise pricing and
                  integrators. We rebuilt them as one connected platform — so a single café and a
                  fifty-branch franchise run on the same dependable foundation, from the first sale
                  to the month-end books.
                </p>
                <Link
                  href="/#how"
                  className="mt-6 inline-flex items-center gap-2 text-brand-600 font-semibold text-[15px] hover:text-brand-700 transition"
                >
                  See how it works
                  <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                </Link>
              </div>
              <div className="reveal rounded-2xl bg-brand-50 hairline p-7 md:col-span-1 flex flex-col justify-center">
                <Icon name="layers" className="w-7 h-7 text-brand-600" strokeWidth={1.7} />
                <div className="mt-4 text-[2.6rem] leading-none font-extrabold tracking-tightest text-brand-700">
                  6+
                </div>
                <p className="mt-2 text-[0.95rem] font-semibold text-ink-soft leading-snug">
                  Connected modules — POS, inventory, procurement, finance, HR, and CRM — sharing one
                  source of truth.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Proof strip */}
        <section className="bg-paper hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-14">
            <div className="grid sm:grid-cols-3 gap-8 text-center">
              {STATS.map((s) => (
                <div key={s.label} className="reveal">
                  <div className="text-[2.6rem] font-extrabold tracking-tightest text-brand-600">
                    {s.value}
                  </div>
                  <div className="mt-1 text-[0.98rem] font-semibold text-ink-soft">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl" />
              <div className="relative">
                <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                  Run your whole business on one platform.
                </h2>
                <p className="mt-2 text-[1rem] text-white/70 max-w-[52ch]">
                  Book a walkthrough and see how VendoPOS fits the way you actually operate.
                </p>
              </div>
              <Link
                href="/#demo"
                className="relative inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14.5px] px-6 py-3.5 rounded-[11px] hover:bg-white/90 transition shrink-0"
              >
                Request a Demo
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
