import type { IconName } from "@/app/components/Icon";

/**
 * Content source for the Resources → Blog section. The blog index lives at
 * /blog and each post at /blog/[slug]; both render from this list, so adding a
 * post is just a new entry here. Dates are ISO; the index sorts newest-first.
 */
export interface BlogSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  icon: IconName;
  /** ISO date, e.g. "2026-05-20". */
  date: string;
  readMinutes: number;
  sections: BlogSection[];
}

export const POSTS: BlogPost[] = [
  {
    slug: "bir-compliance-for-small-businesses",
    title: "BIR compliance for small businesses: what your POS must handle",
    excerpt:
      "Sequential invoicing, VAT-inclusive math, and audit-ready records aren't optional. Here's what a compliant POS should do for you automatically.",
    category: "Compliance",
    icon: "shield",
    date: "2026-05-28",
    readMinutes: 5,
    sections: [
      {
        paragraphs: [
          "For most Philippine retailers and F&B operators, BIR compliance is the part of running a business that feels heaviest — and it's the part the right POS should quietly take off your plate. The goal isn't to become a tax expert; it's to make sure every sale is recorded the way the rules expect, without anyone on the floor having to think about it.",
        ],
      },
      {
        heading: "Sequential, gap-free invoice numbers",
        paragraphs: [
          "Every official receipt needs a unique serial, issued in order, with no gaps. That sounds simple until you have several cashiers ringing sales at the same time. A POS built for this assigns serials atomically, so two registers never collide and you never end up explaining a missing number during an audit.",
        ],
      },
      {
        heading: "VAT computed the right way, every time",
        paragraphs: [
          "VAT-inclusive pricing is the norm here, and the math should be done for you and itemized clearly on each receipt. Manual computation is where errors creep in — and errors are exactly what an inspection looks for.",
        ],
      },
      {
        heading: "Records you can actually pull",
        bullets: [
          "Daily sales summaries that reconcile to your drawers",
          "Exportable reports for any date range, ready for filing",
          "A clear trail from each sale back to its receipt and shift",
        ],
      },
      {
        paragraphs: [
          "The test is simple: when it's time to file or you get inspected, can you produce the numbers in minutes instead of days? If the answer is no, the system is working against you. VendoPOS handles serials, VAT, and exports as a default — not a feature you have to remember to turn on.",
        ],
      },
    ],
  },
  {
    slug: "accepting-gcash-maya-qrph-at-the-counter",
    title: "Accepting GCash, Maya, and QRPH at the counter without the chaos",
    excerpt:
      "Digital payments are now table stakes. The trick is taking them on the same screen as cash — and having every tender reconcile cleanly at end of day.",
    category: "Payments",
    icon: "card",
    date: "2026-05-14",
    readMinutes: 4,
    sections: [
      {
        paragraphs: [
          "Customers expect to pay however is easiest for them — and increasingly that means scanning a QR. The problem most counters hit isn't accepting the payment; it's reconciling a day that mixes cash, cards, and three different e-wallets without losing track of a single peso.",
        ],
      },
      {
        heading: "One tender screen, every method",
        paragraphs: [
          "When cash, card, GCash, Maya, and QRPH all settle into the same sale, your cashier never reaches for a second device or a separate logbook. Split and partial payments are handled in the same flow, and change is computed for you.",
        ],
      },
      {
        heading: "Reconciliation that ties out",
        paragraphs: [
          "Every payment is stamped to the sale and the cashier's shift. At close, your X-Read and Z-Read show exactly what came in by method, so variance is a number you can explain rather than a mystery you chase.",
        ],
      },
      {
        paragraphs: [
          "Digital payments should speed up your line, not complicate your books. Done right, the counter gets faster and the back office gets quieter at the same time.",
        ],
      },
    ],
  },
  {
    slug: "five-inventory-mistakes-that-cost-you-money",
    title: "5 inventory mistakes that quietly cost you money",
    excerpt:
      "Stockouts, dead stock, and shrink rarely announce themselves. They show up as margin that slowly disappears. Here's where it usually hides.",
    category: "Operations",
    icon: "box",
    date: "2026-04-30",
    readMinutes: 6,
    sections: [
      {
        paragraphs: [
          "Inventory is where a healthy-looking business quietly bleeds margin. The losses are rarely dramatic — they accumulate one stockout, one spoiled batch, one untracked giveaway at a time. These are the five we see most often.",
        ],
      },
      {
        heading: "1. Counting by gut, not by system",
        paragraphs: [
          "If your stock levels live in someone's head, they're wrong by the afternoon. Selling should decrement stock automatically and receiving should add it back — no manual recount required to know what's on the shelf.",
        ],
      },
      {
        heading: "2. No reorder threshold",
        paragraphs: [
          "Running out of your bestseller is the most expensive kind of empty shelf. Low-stock alerts tied to a per-item threshold turn reordering from a fire drill into a routine.",
        ],
      },
      {
        heading: "3. Ignoring what doesn't sell",
        paragraphs: [
          "Dead stock ties up cash and shelf space. Your reports should make slow movers as visible as your bestsellers, so you can discount or drop them before they expire.",
        ],
      },
      {
        heading: "4. Treating ingredients like finished goods",
        paragraphs: [
          "If you make what you sell, selling a finished item should deduct its components. Without recipe-aware stock, you find out you're out of an ingredient only when a customer orders it.",
        ],
      },
      {
        heading: "5. One number for many locations",
        paragraphs: [
          "Pooling stock across branches into a single figure hides the branch that's overstocked and the one that's empty. Track each location, and roll them up only when you want the big picture.",
        ],
      },
    ],
  },
  {
    slug: "one-platform-beats-five-disconnected-apps",
    title: "Why one platform beats five disconnected apps",
    excerpt:
      "A POS here, a spreadsheet there, a separate payroll tool — the gaps between your apps are where time and accuracy go to die.",
    category: "Strategy",
    icon: "layers",
    date: "2026-04-16",
    readMinutes: 5,
    sections: [
      {
        paragraphs: [
          "Most growing businesses don't choose a tangle of disconnected tools — they accumulate it. A POS for sales, a spreadsheet for stock, a separate app for suppliers, another for payroll. Each one works. The problem is the space between them.",
        ],
      },
      {
        heading: "The hidden cost is the gaps",
        paragraphs: [
          "Every boundary between two apps is a place where data gets re-keyed, numbers drift apart, and someone spends their evening reconciling. The more you grow, the more those gaps cost — in hours and in trust in your own numbers.",
        ],
      },
      {
        heading: "One source of truth",
        paragraphs: [
          "When sales, stock, suppliers, finances, staff, and customers share one system, a sale updates inventory, feeds your P&L, and credits a customer's loyalty in the same moment. Nothing is entered twice, and every report agrees with every other report.",
        ],
      },
      {
        bullets: [
          "Sell an item → stock drops, revenue posts, loyalty points accrue",
          "Receive a PO → stock rises, the expense lands in finance",
          "Close a shift → the drawer reconciles against recorded sales",
        ],
      },
      {
        paragraphs: [
          "Consolidation isn't about having fewer logins. It's about your business telling you the truth in real time — which is exactly what VendoPOS is built to do.",
        ],
      },
    ],
  },
];

const BY_SLUG = new Map(POSTS.map((p) => [p.slug, p]));

/** Posts newest-first for the index. */
export function listPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

export function getPost(slug: string): BlogPost | undefined {
  return BY_SLUG.get(slug);
}

export function relatedPosts(slug: string, limit = 3): BlogPost[] {
  return listPosts()
    .filter((p) => p.slug !== slug)
    .slice(0, limit);
}

/** Human-friendly date, e.g. "May 28, 2026". */
export function formatPostDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
