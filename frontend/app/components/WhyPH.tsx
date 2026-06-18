import { Icon, type IconName } from "./Icon";

type Advantage = {
  icon?: IconName;
  glyph?: string;
  title: string;
  body: string;
  tags: string[];
};

const advantages: Advantage[] = [
  {
    icon: "receipt",
    title: "BIR-ready receipts & reports",
    body: "Issue compliant receipts and generate the reports you need at tax time — no manual rebuilding, no spreadsheet gymnastics.",
    tags: ["Compliance", "Sales reports"],
  },
  {
    icon: "card",
    title: "GCash, Maya & QRPH",
    body: "Accept the payments your Customers actually use. Cash, e-wallets, and QR — all rung up the same simple way.",
    tags: ["GCash", "Maya", "QRPH"],
  },
  {
    icon: "wifi-off",
    title: "Works offline, syncs later",
    body: "When the internet drops, the POS keeps selling. Transactions sync automatically the moment you’re back online — you never lose a sale.",
    tags: ["Offline-first", "Auto-sync"],
  },
  {
    glyph: "₱",
    title: "Peso-first, end to end",
    body: "Every price, report, and total is in Philippine peso. No currency confusion, no conversion guesswork — just your money, your way.",
    tags: ["₱ everywhere", "Local-first"],
  },
];

export function WhyPH() {
  return (
    <section id="why" className="py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Built for the Philippines
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            The advantages global POS tools ignore.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            Square and Lightspeed weren’t built for here. VendoPOS is — down to the receipt, the
            payment, and the peso.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-4 reveal">
          {advantages.map((a) => (
            <div key={a.title} className="lift rounded-xl2 bg-white hairline p-8 flex gap-6 items-start">
              <div className="w-12 h-12 shrink-0 rounded-[13px] bg-accent-50 grid place-items-center">
                {a.icon ? (
                  <Icon name={a.icon} className="w-6 h-6 text-accent-600" />
                ) : (
                  <span className="text-accent-600 font-extrabold text-[22px] leading-none">
                    {a.glyph}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-[1.18rem] font-bold tracking-tight">{a.title}</h3>
                <p className="mt-2 text-[0.96rem] text-ink-soft leading-relaxed">{a.body}</p>
                <div className="mt-4 flex gap-2 flex-wrap">
                  {a.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11.5px] font-semibold text-ink-soft bg-paper hairline px-2.5 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
