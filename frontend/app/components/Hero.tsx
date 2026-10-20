import { Icon } from "./Icon";
import { HeroPosDemo } from "./HeroPosDemo";

const benefits = ["BIR-ready receipts", "GCash · Maya · QRPH", "Senior / PWD discounts", "Peso-first"];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg [mask-image:radial-gradient(900px_440px_at_72%_8%,black,transparent_75%)]" />
      <div className="absolute -top-24 right-0 w-[620px] h-[620px] rounded-full bg-brand-50 blur-3xl opacity-70" />
      <div className="relative max-w-[1160px] mx-auto px-6 pt-20 pb-24">
        <div className="grid lg:grid-cols-[1.04fr_0.96fr] gap-16 items-center">
          {/* Left */}
          <div className="reveal">
            <span className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-wide uppercase text-brand-600 bg-brand-50 hairline px-3 py-1.5 rounded-full">
              POS + ERP · 7 tools, one login
            </span>
            <h1 className="mt-6 text-[clamp(2.5rem,5.4vw,3.85rem)] leading-[1.04] tracking-tightest font-extrabold text-ink">
              One platform to run
              <br className="hidden sm:block" />{" "}
              <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
                your whole business.
              </span>
            </h1>
            <p className="mt-6 text-[1.16rem] leading-relaxed text-ink-soft max-w-[52ch]">
              VendoPOS brings your sales, stock, customers, finances, and staff into a single
              system — designed for how Filipino coffee shops, restaurants, and retailers actually
              operate.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#demo"
                className="press inline-flex items-center gap-2 bg-brand-600 text-white font-semibold px-6 py-3.5 rounded-[11px] shadow-btn hover:bg-brand-700"
              >
                Request a Demo
                <Icon name="arrow" className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </a>
              <a
                href="#tools"
                className="press inline-flex items-center gap-2 bg-white hairline text-ink font-semibold px-6 py-3.5 rounded-[11px] hover:border-brand-200 hover:text-brand-600"
              >
                Explore the 7 Core Tools
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-2.5 text-[14.5px] text-ink-soft font-medium">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: live point-of-sale demo */}
          <div className="reveal">
            <HeroPosDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
