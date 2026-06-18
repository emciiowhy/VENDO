import Link from "next/link";
import { Icon } from "./Icon";

type Plan = {
  name: string;
  forWho: string;
  price: string;
  per?: string;
  indicative: boolean;
  features: string[];
  featured?: boolean;
  /** Self-service trial tier → routes to signup. Enterprise stays contact-sales. */
  signupPlan?: "starter" | "business";
};

const plans: Plan[] = [
  {
    name: "Starter",
    forWho: "For single-location coffee shops & small retailers.",
    price: "₱499",
    per: "/mo",
    indicative: true,
    signupPlan: "starter",
    features: [
      "Point of Sale",
      "Inventory",
      "BIR-ready receipts",
      "GCash / Maya / QRPH",
      "Offline-capable POS",
    ],
  },
  {
    name: "Business",
    forWho: "For growing multi-staff retailers & restaurants.",
    price: "₱1,499",
    per: "/mo",
    indicative: true,
    featured: true,
    signupPlan: "business",
    features: [
      "Everything in Starter",
      "Procurement & Supply Chain",
      "Customer Relationship (CRM)",
      "Finance & Accounting",
      "Multi-staff roles",
      "Custom Branding",
    ],
  },
  {
    name: "Enterprise",
    forWho: "For large, complex, multi-location operations.",
    price: "Contact us",
    indicative: false,
    features: [
      "Everything in Business",
      "Manufacturing (recipes / BOM)",
      "Human Resources & payroll",
      "Multi-location",
      "Priority support",
    ],
  },
];

/**
 * The public pricing section.
 *
 * `isFirstPurchase` drives a first-time-buyer promo: when true, the self-serve
 * tiers (Starter & Business) surface a striking promotional badge. Enterprise is
 * never discounted here — it's a contact-sales concierge funnel — so the badge is
 * scoped to plans with a `signupPlan`.
 */
export function Pricing({ isFirstPurchase = false }: { isFirstPurchase?: boolean }) {
  return (
    <section id="pricing" className="py-28">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="max-w-[60ch] reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Plans
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Pick the bundle that fits where you are.
          </h2>
          <p className="mt-5 text-[1.08rem] text-ink-soft leading-relaxed">
            Every plan differs by which tools are unlocked. Start small, upgrade as you grow — same
            platform, no migration.
          </p>
        </div>

        <div className="mt-14 grid lg:grid-cols-3 gap-5 items-stretch reveal">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={
                "lift rounded-xl2 bg-white p-8 flex flex-col relative " +
                (plan.featured ? "border-2 border-brand-500 shadow-soft" : "hairline")
              }
            >
              {plan.featured && (
                <span className="absolute top-6 right-6 text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 hairline px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <h3 className="text-[1.3rem] font-extrabold tracking-tight">{plan.name}</h3>
              <p className="mt-1.5 text-[0.9rem] text-ink-soft min-h-[40px]">{plan.forWho}</p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-[2.6rem] font-extrabold tracking-tightest">{plan.price}</span>
                {plan.per && <span className="text-ink-soft font-semibold">{plan.per}</span>}
              </div>
              <span
                className={
                  "mt-2 inline-block text-[11.5px] font-semibold px-2.5 py-1 rounded-md self-start " +
                  (plan.indicative ? "text-amber-700 bg-amber-50" : "invisible")
                }
              >
                Indicative — not final
              </span>
              {/* First-time-buyer promo — self-serve tiers only (never Enterprise). */}
              {isFirstPurchase && plan.signupPlan && (
                <div className="mt-4 flex items-center gap-2 rounded-[10px] bg-brand-600 text-white px-3.5 py-2.5 shadow-btn">
                  <Icon name="bolt" className="w-[16px] h-[16px] shrink-0" strokeWidth={2.1} />
                  <span className="text-[12.5px] font-bold tracking-tight leading-snug">
                    First-time Buyer: 20% OFF your first 3 months
                  </span>
                </div>
              )}
              <ul className="mt-7 space-y-3.5 flex-1">
                {plan.features.map((f, i) => (
                  <li
                    key={f}
                    className={
                      "flex gap-3 text-[0.93rem] " + (i === 0 ? "text-ink" : "text-ink-soft")
                    }
                  >
                    <Icon
                      name="check"
                      className="w-[18px] h-[18px] shrink-0 text-accent-600 mt-0.5"
                      strokeWidth={2}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.signupPlan ? (
                <Link
                  href={`/auth/signup?plan=${plan.signupPlan}`}
                  className={
                    "press mt-7 inline-flex justify-center items-center gap-2 font-semibold py-3 rounded-[11px] " +
                    (plan.featured
                      ? "bg-brand-600 text-white shadow-btn hover:bg-brand-700"
                      : "bg-white hairline text-ink hover:border-brand-200 hover:text-brand-600")
                  }
                >
                  Start Free Trial
                  <Icon name="arrow" className="w-[17px] h-[17px]" strokeWidth={2} />
                </Link>
              ) : (
                <Link
                  href="/enterprise"
                  className="press mt-7 inline-flex justify-center items-center gap-2 font-semibold py-3 rounded-[11px] bg-white hairline text-ink hover:border-brand-200 hover:text-brand-600"
                >
                  Talk to our team
                  <Icon name="arrow" className="w-[17px] h-[17px]" strokeWidth={2} />
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[0.9rem] text-ink-soft">
          Prices shown in Philippine peso (₱) and are indicative placeholders pending finalisation.
          Starter &amp; Business include a 14-day free trial — no card required. Enterprise starts with
          a demo.
        </p>
      </div>
    </section>
  );
}
