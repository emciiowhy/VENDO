import { collection, type MarketingEntry } from "./marketing";

/**
 * Content source for /company/[slug] — About Us, Careers, Contact Us. Slugs are
 * the single source of truth shared with generateStaticParams and the nav.
 * Company pages set their own cardsHeading (and Careers points its CTA at the
 * Contact page rather than the demo form).
 */
export const COMPANY: MarketingEntry[] = [
  {
    slug: "about",
    eyebrow: "Company",
    icon: "building",
    name: "About Us",
    tagline: "Built for how Filipino businesses actually run.",
    intro:
      "VendoPOS is one multi-tenant POS + ERP platform — sales, stock, suppliers, finances, staff, and customers in a single system, peso-first and BIR-ready.",
    cardsHeading: "What we stand for",
    cards: [
      {
        icon: "store",
        title: "Local-first",
        body: "Designed around Philippine retail and F&B realities, from BIR to GCash/Maya/QRPH.",
      },
      {
        icon: "layers",
        title: "One platform",
        body: "Replace a stack of disconnected apps with a single source of truth.",
      },
      {
        icon: "heart",
        title: "Built with operators",
        body: "Shaped by the day-to-day needs of the businesses that run on it.",
      },
    ],
  },
  {
    slug: "careers",
    eyebrow: "Company",
    icon: "users",
    name: "Careers",
    tagline: "Help build the platform PH businesses run on.",
    intro:
      "We're a focused team shipping real tools for real merchants. If that sounds like you, we'd love to talk.",
    cardsHeading: "Where we hire",
    ctaLabel: "Get in touch",
    ctaHref: "/company/contact",
    cards: [
      {
        icon: "bolt",
        title: "Engineering",
        body: "Full-stack, frontend, and platform roles building the product end to end.",
      },
      {
        icon: "heart",
        title: "Customer Success",
        body: "Onboard and support the merchants who run their business on VendoPOS.",
      },
      {
        icon: "chart",
        title: "Growth & Operations",
        body: "Marketing, sales, and ops that bring VendoPOS to more counters.",
      },
    ],
  },
  {
    slug: "contact",
    eyebrow: "Company",
    icon: "card",
    name: "Contact Us",
    tagline: "Talk to us — we're quick to reply.",
    intro:
      "Questions, demos, or support — reach the VendoPOS team and we'll get back to you fast.",
    cardsHeading: "Ways to reach us",
    cards: [
      {
        icon: "users",
        title: "Request a demo",
        body: "See VendoPOS set up around your business. Book a walkthrough with our team.",
      },
      {
        icon: "bell",
        title: "Support",
        body: "Already a customer? We're here to help you keep running smoothly.",
      },
      {
        icon: "building",
        title: "Partnerships",
        body: "Hardware, payments, or reseller partner? Let's explore working together.",
      },
    ],
  },
];

export const company = collection(COMPANY);
