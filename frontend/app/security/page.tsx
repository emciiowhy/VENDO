import type { Metadata } from "next";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";

export const metadata: Metadata = {
  title: "Data & Security Architecture — VendoPOS",
  description:
    "Enterprise-grade protection running through every register transaction — fenced tenant database scoping on NeonDB, HTTP-only session propagation, and immutable invoice sequence-integrity tracking.",
  openGraph: {
    title: "Data & Security Architecture — VendoPOS",
    description:
      "Database scoping, session-layer protection, and audit resiliency — the infrastructure controls behind every VendoPOS register transaction.",
    type: "website",
  },
};

const HQ = "Cebu City, Philippines";
const PHONE = "0915 515 2314";
const SECURITY_EMAIL = "security@vendopos.app";

/** The two non-featured primary controls (stacked beside the featured tile). */
const PRIMARY: { icon: IconName; eyebrow: string; title: string; body: string }[] = [
  {
    icon: "lock",
    eyebrow: "Session Layer Protection",
    title: "Sessions that never leak.",
    body: "Secure, HTTP-only cookie sessions propagate straight to our backend — never exposed to client-readable storage and never replayable off-device.",
  },
  {
    icon: "receipt",
    eyebrow: "Audit Resiliency",
    title: "Every invoice, accountable.",
    body: "Immutable sequence-integrity tracking covers all retail invoices — gapless numbering, tamper-evident records, and a replayable audit trail.",
  },
];

/** Supporting controls — defense-in-depth layers under the headline three. */
const SUPPORTING: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "shield",
    title: "Encryption in Transit",
    body: "TLS on every hop between register, browser, and backend — no plaintext crosses the wire.",
  },
  {
    icon: "users",
    title: "Least-Privilege Access",
    body: "Scoped roles and a narrow, fully audited support path. Staff see only what their role allows.",
  },
  {
    icon: "refresh",
    title: "Continuous Backups",
    body: "Routine snapshots with point-in-time recovery, so a bad day never becomes lost data.",
  },
];

export default function SecurityPage() {
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
              <Icon name="shield" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">Data & Security</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.8vw,3.4rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
              Data &amp; Security Architecture
            </h1>
            <p className="reveal mt-6 mx-auto max-w-[60ch] text-[1.1rem] leading-relaxed text-ink-soft">
              Enterprise-grade protection running through every register transaction.
            </p>
            <div className="reveal mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[12.5px] font-semibold text-ink-faint">
              <span className="inline-flex items-center gap-2">
                <Icon name="database" className="w-4 h-4" strokeWidth={1.8} />
                NeonDB managed Postgres
              </span>
              <span className="w-1 h-1 rounded-full bg-ink-faint" />
              <span className="inline-flex items-center gap-2">
                <Icon name="check" className="w-4 h-4" strokeWidth={2} />
                RA 10173 aligned
              </span>
            </div>
          </div>
        </section>

        {/* Bento grid — infrastructure controls */}
        <section className="bg-surface hairline-b">
          <div className="max-w-[1160px] mx-auto px-6 py-16 md:py-20">
            <div className="reveal max-w-[56ch]">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-600">
                Infrastructure controls
              </span>
              <h2 className="mt-3 text-[clamp(1.7rem,3vw,2.2rem)] leading-tight font-extrabold tracking-tightest text-ink">
                Protection built into the architecture, not bolted on.
              </h2>
            </div>

            {/* Primary bento: featured Database Scoping + two stacked controls */}
            <div className="mt-10 grid gap-5 md:grid-cols-3 md:grid-rows-2">
              {/* Featured — Database Scoping */}
              <article className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-7 md:p-9 flex flex-col md:col-span-2 md:row-span-2 shadow-soft">
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
                  className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-500/30 blur-3xl"
                />
                <div className="relative flex items-center justify-between">
                  <span className="grid place-items-center w-12 h-12 rounded-[13px] bg-white/12">
                    <Icon name="database" className="w-[22px] h-[22px] text-white" strokeWidth={1.7} />
                  </span>
                  <span className="text-[10.5px] font-bold tracking-widest uppercase text-white/70 bg-white/10 rounded-full px-2.5 py-1">
                    Database Scoping
                  </span>
                </div>
                <h3 className="relative mt-6 text-[1.5rem] md:text-[1.7rem] font-extrabold tracking-tight leading-tight">
                  Fenced tenants, completely isolated.
                </h3>
                <p className="relative mt-3 text-[1rem] leading-relaxed text-white/75 max-w-[46ch]">
                  Fenced tenant parameters isolate every record completely inside our NeonDB instance.
                  Each query is bound to a single tenant key — there is no path for one merchant&rsquo;s
                  data to surface in another&rsquo;s.
                </p>
                <ul className="relative mt-6 grid sm:grid-cols-2 gap-x-6 gap-y-3 flex-1 content-end">
                  {[
                    "Row-level tenant key on every record",
                    "Zero cross-tenant joins, by design",
                    "Managed, encrypted Postgres on NeonDB",
                    "Isolation enforced at the data layer",
                  ].map((pt) => (
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

              {/* Two stacked primary controls */}
              {PRIMARY.map((c, i) => (
                <article
                  key={c.eyebrow}
                  className="reveal group rounded-2xl bg-paper hairline p-7 flex flex-col hover:border-brand-200 hover:shadow-soft transition duration-200"
                  style={{ transitionDelay: `${(i + 1) * 70}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 text-brand-600 hairline">
                      <Icon name={c.icon} className="w-[20px] h-[20px]" strokeWidth={1.7} />
                    </span>
                    <span className="text-[10.5px] font-bold tracking-widest uppercase text-ink-faint">
                      {c.eyebrow}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[1.18rem] font-extrabold tracking-tight text-ink">
                    {c.title}
                  </h3>
                  <p className="mt-2.5 text-[0.95rem] leading-relaxed text-ink-soft flex-1">
                    {c.body}
                  </p>
                </article>
              ))}
            </div>

            {/* Supporting controls — defense in depth */}
            <div className="mt-5 grid gap-5 md:grid-cols-3">
              {SUPPORTING.map((c, i) => (
                <article
                  key={c.title}
                  className="reveal rounded-2xl bg-paper hairline p-6"
                  style={{ transitionDelay: `${i * 70}ms` }}
                >
                  <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-surface text-brand-600 hairline">
                    <Icon name={c.icon} className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  </span>
                  <h3 className="mt-4 text-[1.02rem] font-bold tracking-tight text-ink">{c.title}</h3>
                  <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-soft">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Assurance band */}
        <section className="bg-surface">
          <div className="max-w-[1160px] mx-auto px-6 py-16">
            <div className="reveal relative overflow-hidden rounded-2xl bg-ink text-white p-9 md:p-12">
              <div
                aria-hidden="true"
                className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-500/20 blur-3xl"
              />
              <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
                <div className="max-w-[46ch]">
                  <h2 className="text-[1.7rem] font-extrabold tracking-tightest">
                    Aligned with the Data Privacy Act.
                  </h2>
                  <p className="mt-2.5 text-[1rem] leading-relaxed text-white/70">
                    Our controls map to RA 10173 and the issuances of the National Privacy Commission.
                    Have a security or compliance question? Talk to the team that runs the platform.
                  </p>
                  <Link
                    href="/contact"
                    className="mt-6 inline-flex items-center gap-2 bg-white text-ink font-semibold text-[14px] px-5 py-3 rounded-[11px] hover:bg-white/90 transition"
                  >
                    Contact our team
                    <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  </Link>
                </div>
                <dl className="grid sm:grid-cols-3 lg:grid-cols-1 gap-5 lg:gap-4 lg:min-w-[260px] lg:border-l lg:border-white/10 lg:pl-8">
                  {(
                    [
                      { icon: "shield", label: "Security", value: SECURITY_EMAIL },
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
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
