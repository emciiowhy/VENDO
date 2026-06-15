import type { Metadata } from "next";
import { Icon, IconSprite, type IconName } from "@/app/components/Icon";
import { Nav } from "@/app/components/Nav";
import { Footer } from "@/app/components/Footer";
import { ScrollReveal } from "@/app/components/ScrollReveal";
import { ContactForm } from "@/app/components/marketing/ContactForm";

export const metadata: Metadata = {
  title: "Contact Us — VendoPOS",
  description:
    "Talk to VendoPOS. Enterprise sales replies in under 2 hours; platform support in under 30 minutes. Reach our team in Cebu or send us a message.",
  openGraph: {
    title: "Contact VendoPOS",
    description:
      "Talk to enterprise sales or platform support — fast response-time guarantees and a direct line to our team in the Philippines.",
    type: "website",
  },
};

/** High-utility contact channels with explicit response-time guarantees. */
const CHANNELS: {
  icon: IconName;
  title: string;
  blurb: string;
  email: string;
  responseTime: string;
}[] = [
  {
    icon: "building",
    title: "Enterprise Sales",
    blurb: "Multi-branch rollouts, migrations, and volume pricing.",
    email: "sales@vendopos.app",
    responseTime: "Under 2 hours",
  },
  {
    icon: "activity",
    title: "Platform Support",
    blurb: "Live merchants who need a hand at the counter, fast.",
    email: "support@vendopos.app",
    responseTime: "Under 30 minutes",
  },
];

/** Where to find us. */
const DETAILS: { icon: IconName; label: string; value: string }[] = [
  { icon: "home", label: "Headquarters", value: "Cebu City, Philippines" },
  { icon: "clock", label: "Hours", value: "Mon–Sat · 8:00 AM – 8:00 PM PHT" },
  { icon: "card", label: "Phone", value: "0915 515 2314" },
];

export default function ContactPage() {
  return (
    <>
      <IconSprite />
      <ScrollReveal />
      <Nav />
      <main>
        {/* Header */}
        <section className="relative overflow-hidden bg-paper hairline-b">
          <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_400px_at_50%_0%,black,transparent_75%)]" />
          <div className="relative max-w-[1000px] mx-auto px-6 pt-20 md:pt-24 pb-14 text-center">
            <div className="reveal inline-flex items-center gap-2 text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              <Icon name="bell" className="w-4 h-4" strokeWidth={1.7} />
              <span className="text-[12px] font-bold tracking-widest uppercase">Contact</span>
            </div>
            <h1 className="reveal mt-5 mx-auto max-w-[20ch] text-[clamp(2.2rem,4.6vw,3.2rem)] leading-[1.05] font-extrabold tracking-tightest text-ink">
              Talk to a team that knows retail.
            </h1>
            <p className="reveal mt-5 mx-auto max-w-[56ch] text-[1.08rem] leading-relaxed text-ink-soft">
              Whether you&rsquo;re scaling across branches or just sizing us up, reach the right desk
              and get a real answer — fast.
            </p>
          </div>
        </section>

        {/* Dual-pane split */}
        <section className="bg-surface">
          <div className="max-w-[1100px] mx-auto px-6 py-16 md:py-20">
            <div className="reveal rounded-[22px] hairline shadow-soft overflow-hidden grid lg:grid-cols-2">
              {/* Left pane — contact info + response guarantees */}
              <div className="relative bg-ink text-white p-8 sm:p-10">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                    backgroundSize: "36px 36px",
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-brand-500/25 blur-3xl"
                />

                <div className="relative">
                  <h2 className="text-[1.5rem] font-extrabold tracking-tightest">
                    Reach the right desk.
                  </h2>
                  <p className="mt-2 text-[0.98rem] leading-relaxed text-white/70 max-w-[42ch]">
                    Every channel carries a response-time guarantee — because when you run a store, a
                    slow reply is a real cost.
                  </p>

                  <div className="mt-8 space-y-4">
                    {CHANNELS.map((c) => (
                      <div key={c.title} className="rounded-2xl bg-white/[0.06] p-5">
                        <div className="flex items-start gap-4">
                          <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-white/10 shrink-0">
                            <Icon
                              name={c.icon}
                              className="w-[20px] h-[20px] text-white"
                              strokeWidth={1.7}
                            />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-[1.02rem] font-bold tracking-tight text-white">
                              {c.title}
                            </h3>
                            <p className="mt-0.5 text-[13px] leading-relaxed text-white/65">
                              {c.blurb}
                            </p>
                            <a
                              href={`mailto:${c.email}`}
                              className="mt-2 inline-block text-[13.5px] font-semibold text-white hover:text-brand-200 transition"
                            >
                              {c.email}
                            </a>
                          </div>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                          <span className="text-[11.5px] font-semibold text-white">
                            Replies in {c.responseTime}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 pt-7 border-t border-white/10 space-y-4">
                    {DETAILS.map((d) => (
                      <div key={d.label} className="flex items-start gap-3.5">
                        <Icon
                          name={d.icon}
                          className="w-[18px] h-[18px] mt-0.5 text-white/55 shrink-0"
                          strokeWidth={1.7}
                        />
                        <div>
                          <div className="text-[11px] font-bold tracking-widest uppercase text-white/45">
                            {d.label}
                          </div>
                          <div className="mt-0.5 text-[14px] font-semibold text-white/90">
                            {d.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right pane — message form (matches /auth/signup field chrome) */}
              <div className="bg-surface p-8 sm:p-10">
                <h2 className="text-[1.5rem] font-extrabold tracking-tightest text-ink">
                  Send us a message
                </h2>
                <p className="mt-2 text-[0.98rem] leading-relaxed text-ink-soft">
                  Tell us a little about your business and we&rsquo;ll route you to the right
                  specialist.
                </p>
                <div className="mt-7">
                  <ContactForm />
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
