import { Icon } from "./Icon";

const today = [
  "Five or more tools, none of them connected.",
  "Tax season means rebuilding BIR reports by hand.",
  "The internet drops and you can’t ring up a sale.",
  "Foreign POS tools price in dollars, ignore e-wallets.",
  "No single source of truth across the business.",
];

const withVendo = [
  "One platform, seven connected tools.",
  "BIR-ready receipts and reports out of the box.",
  "Keeps selling offline, syncs the moment you’re back.",
  "Peso-first with GCash, Maya, and QRPH built in.",
  "Everything in one place — one source of truth.",
];

export function Problem() {
  return (
    <section id="problem" className="py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[58ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            The problem
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Your business runs on spreadsheets and a dozen disconnected apps.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            Sales here, stock there, suppliers in a chat thread, payroll in another sheet. Nothing
            talks to each other — and none of it was built for the way you actually operate in the
            Philippines.
          </p>
        </div>

        <div className="mt-16 grid md:grid-cols-2 gap-px bg-[rgba(11,18,32,0.07)] hairline rounded-xl2 overflow-hidden reveal">
          <div className="bg-white p-9 lg:p-12">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold tracking-widest uppercase text-ink-faint">
                Today
              </span>
              <span className="h-px flex-1 bg-[rgba(11,18,32,0.08)]" />
            </div>
            <ul className="mt-7 space-y-5">
              {today.map((t) => (
                <li key={t} className="flex gap-4 text-ink-soft text-[1.02rem] leading-snug">
                  <span className="text-ink-faint mt-0.5">—</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-ink text-white p-9 lg:p-12 relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-brand-500/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="text-[12px] font-bold tracking-widest uppercase text-brand-200">
                With VendoPOS
              </span>
              <span className="h-px flex-1 bg-white/15" />
            </div>
            <ul className="relative mt-7 space-y-5">
              {withVendo.map((t) => (
                <li key={t} className="flex gap-4 text-white/90 text-[1.02rem] leading-snug">
                  <Icon
                    name="check"
                    className="w-[18px] h-[18px] mt-0.5 shrink-0 text-accent-500"
                    strokeWidth={2}
                  />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
