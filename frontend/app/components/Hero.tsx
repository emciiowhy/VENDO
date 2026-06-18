import { Icon } from "./Icon";

const benefits = ["BIR-ready receipts", "GCash · Maya · QRPH", "Works offline", "Peso-first"];

const products = [
  { name: "Kapeng Barako", price: "₱120" },
  { name: "Milk Tea", price: "₱140" },
  { name: "Ensaymada", price: "₱85" },
  { name: "Ube Cake", price: "₱160" },
];

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
              POS + ERP · Built for the Philippines
            </span>
            <h1 className="mt-6 text-[clamp(2.5rem,5.4vw,3.85rem)] leading-[1.04] tracking-tightest font-extrabold text-ink">
              One platform to run
              <br className="hidden sm:block" />{" "}
              <span className="bg-gradient-to-r from-brand-600 to-accent-500 bg-clip-text text-transparent">
                your whole business.
              </span>
            </h1>
            <p className="mt-6 text-[1.16rem] leading-relaxed text-ink-soft max-w-[52ch]">
              VendoPOS brings your sales, stock, suppliers, finances, and staff into a single
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

          {/* Right: minimal mini-dashboard */}
          <div className="reveal">
            <div className="lift rounded-xl2 bg-white hairline shadow-soft overflow-hidden">
              <div className="flex items-center gap-2 px-5 h-11 hairline-b bg-paper">
                <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
                <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
                <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
                <span className="ml-auto text-[12px] font-semibold text-ink-faint tracking-wide">
                  VendoPOS · Point of Sale
                </span>
              </div>
              <div className="grid grid-cols-[1.35fr_1fr]">
                {/* product list */}
                <div className="p-4 grid grid-cols-2 gap-2.5 content-start hairline-r">
                  {products.map((p) => (
                    <div key={p.name} className="hairline rounded-lg p-3">
                      <div className="w-7 h-7 rounded-md bg-brand-50 hairline mb-2.5 grid place-items-center">
                        <Icon name="box" className="w-4 h-4 text-brand-600" strokeWidth={1.6} />
                      </div>
                      <div className="text-[12.5px] font-bold text-ink">{p.name}</div>
                      <div className="text-[12px] text-ink-faint">{p.price}</div>
                    </div>
                  ))}
                </div>
                {/* cart */}
                <div className="p-4 bg-paper flex flex-col">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">
                    Current order
                  </div>
                  <div>
                    <div className="flex justify-between text-[12.5px] py-2 hairline-b">
                      <span className="text-ink-soft">Kapeng Barako ×2</span>
                      <span className="font-semibold">₱240</span>
                    </div>
                    <div className="flex justify-between text-[12.5px] py-2 hairline-b">
                      <span className="text-ink-soft">Ensaymada ×1</span>
                      <span className="font-semibold">₱85</span>
                    </div>
                    <div className="flex justify-between text-[12.5px] py-2 hairline-b">
                      <span className="text-ink-soft">Milk Tea ×1</span>
                      <span className="font-semibold">₱140</span>
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[12px] font-semibold text-ink-soft uppercase tracking-wide">
                        Total
                      </span>
                      <span className="text-[1.4rem] font-extrabold tracking-tight">₱465</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1.5">
                      <span className="text-[11px] font-bold text-accent-600 bg-accent-50 rounded-md py-1.5 text-center">
                        GCash
                      </span>
                      <span className="text-[11px] font-bold text-accent-600 bg-accent-50 rounded-md py-1.5 text-center">
                        Maya
                      </span>
                      <span className="text-[11px] font-bold text-accent-600 bg-accent-50 rounded-md py-1.5 text-center">
                        QRPH
                      </span>
                      <span className="text-[11px] font-bold text-ink-soft bg-white hairline rounded-md py-1.5 text-center">
                        Cash
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
