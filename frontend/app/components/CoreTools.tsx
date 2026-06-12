import { Icon, type IconName } from "./Icon";

const tools: { icon: IconName; title: string; body: string }[] = [
  { icon: "pos", title: "Point of Sale", body: "Ring up Customers and take payment — the fast front-of-house sales surface." },
  { icon: "box", title: "Inventory", body: "Know exactly how much stock you have and where it sits, in real time." },
  { icon: "truck", title: "Procurement & Supply Chain", body: "Suppliers, purchase orders, and receiving — manage how goods arrive." },
  { icon: "factory", title: "Manufacturing", body: "Build products from raw materials with recipes and bill-of-materials." },
  { icon: "chart", title: "Finance & Accounting", body: "Money in and out — sales reports, expenses, tax, and profit & loss." },
  { icon: "users", title: "Human Resources", body: "Employees, shifts, and payroll for your own staff." },
  { icon: "heart", title: "Customer Relationship", body: "Track your Customers and grow loyalty over time." },
];

export function CoreTools() {
  return (
    <section id="tools" className="py-28 bg-paper hairline-y">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            One platform, seven core tools
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Everything your business does, in one place.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            Each tool owns exactly one job. Turn on what you need today; add the rest as you grow —
            without ever switching systems.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4 reveal">
          {/* wide highlight */}
          <article className="col-span-2 row-span-1 lg:row-span-2 rounded-xl2 bg-ink text-white p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -right-20 -bottom-20 w-64 h-64 rounded-full bg-brand-500/25 blur-3xl" />
            <div className="relative">
              <div className="w-11 h-11 rounded-[12px] bg-white/10 grid place-items-center">
                <Icon name="layers" className="w-6 h-6 text-white" />
              </div>
              <h3 className="mt-6 text-[1.5rem] font-extrabold tracking-tight leading-tight">
                One login.
                <br />
                One source of truth.
              </h3>
              <p className="mt-3 text-white/70 text-[0.98rem] leading-relaxed max-w-[34ch]">
                Every tool shares the same data, so a sale at the POS updates inventory, feeds your
                finances, and rewards loyalty — automatically.
              </p>
            </div>
            <div className="relative mt-8 flex items-center gap-2 text-[13px] font-semibold text-brand-200">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500" /> Fully isolated per business
            </div>
          </article>

          {tools.map((t) => (
            <article
              key={t.title}
              className="rounded-xl2 bg-white hairline p-6 hover:-translate-y-0.5 transition"
            >
              <div className="w-11 h-11 rounded-[12px] bg-brand-50 hairline grid place-items-center mb-5">
                <Icon name={t.icon} className="w-[22px] h-[22px] text-brand-600" />
              </div>
              <h3 className="text-[1.05rem] font-bold tracking-tight">{t.title}</h3>
              <p className="mt-2 text-[0.9rem] text-ink-soft leading-relaxed">{t.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
