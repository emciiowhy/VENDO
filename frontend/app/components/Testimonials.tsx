import { Icon } from "./Icon";

/**
 * Social-proof matrix — mock case studies from local operators, each praising a
 * specific VendoPOS strength: BIR-ready audit structures, offline sync, and fast
 * cashier switching. Surfaces use design tokens so the row reads correctly in
 * both Light and Dark.
 */
interface Review {
  quote: string;
  name: string;
  role: string;
  store: string;
  region: string;
  initials: string;
  highlight: string;
}

const REVIEWS: Review[] = [
  {
    quote:
      "Espresso rush doesn't wait. VendoPOS keeps up shot-for-shot, and Senior/PWD discounts on food orders land in one tap — no mental math at the bar. Best of all, when baristas swap the drawer mid-shift it reconciles to the centavo, so handovers stop being an argument.",
    name: "Justine Mirafuentes",
    role: "Owner",
    store: "Local Coffee Co.",
    region: "Quezon City",
    initials: "JM",
    highlight: "Senior/PWD discounts in one tap",
  },
  {
    quote:
      "Morning rush is chaos — one barista's steaming milk while another needs to ring up an artisanal pastry. The 4-digit PIN switch means they trade the terminal in two seconds flat. The line keeps moving and nothing gets rung up under the wrong name.",
    name: "Chef Marco",
    role: "Head Baker",
    store: "TeaModern Bakes & Café",
    region: "Makati City",
    initials: "CM",
    highlight: "2-second PIN switching",
  },
];

export function Testimonials() {
  return (
    <section id="stories" className="py-28 bg-paper hairline-y">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Loved behind the espresso bar
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Brewed fast. Counted to the centavo.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            From neighbourhood coffee bars to bakeries and pastry cafés — here&apos;s what local food
            &amp; beverage operators say after switching their counters to VendoPOS.
          </p>
        </div>

        <div className="mt-14 grid md:grid-cols-2 gap-5 max-w-[920px] reveal">
          {REVIEWS.map((r) => (
            <figure
              key={r.store}
              className="rounded-xl2 bg-surface hairline shadow-card p-7 flex flex-col"
            >
              <div className="flex items-center gap-1 text-brand-500" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} />
                ))}
              </div>
              <blockquote className="mt-4 flex-1 text-[1rem] leading-relaxed text-ink">
                “{r.quote}”
              </blockquote>
              <div className="mt-5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 text-accent-600 px-3 py-1 text-[11.5px] font-bold tracking-tight">
                  <Icon name="check" className="w-[14px] h-[14px]" strokeWidth={2.2} />
                  {r.highlight}
                </span>
              </div>
              <figcaption className="mt-5 pt-5 hairline-t flex items-center gap-3">
                <span className="grid place-items-center w-11 h-11 rounded-full bg-ink dark:bg-[#0b1220] text-white font-bold text-[14px] tracking-tight">
                  {r.initials}
                </span>
                <div className="leading-tight">
                  <div className="font-bold tracking-tight">{r.name}</div>
                  <div className="text-[12.5px] text-ink-soft">
                    {r.role} · {r.store}, {r.region}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.6 6.1 21.3l1.2-6.6L2.5 9.5l6.6-.9L12 2.5Z" />
    </svg>
  );
}
