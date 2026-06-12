import { Icon } from "./Icon";

const faqs = [
  {
    q: "Is my business data private and isolated?",
    a: "Yes. Each business runs on its own isolated workspace. Your sales, stock, customers, and finances are fully separated from every other business on the platform — no one else can see your data, and you can’t see theirs.",
    open: true,
  },
  {
    q: "Do I have to sign a long contract?",
    a: "No long lock-in. We start with a demo and onboard you hands-on. Plans are month-to-month, and we’ll walk you through exactly what’s included before you commit.",
  },
  {
    q: "What happens when the internet goes down?",
    a: "Your POS keeps working. Sales are recorded locally and sync automatically the moment your connection is back — so you never miss a transaction during a brownout or a dropped line.",
  },
  {
    q: "Are the receipts and reports BIR-compliant?",
    a: "VendoPOS is built peso-first with BIR-ready receipts and reports, so tax time doesn’t mean rebuilding everything by hand. We’ll confirm the specifics for your business type during onboarding.",
  },
  {
    q: "Can my Customers pay with GCash and Maya?",
    a: "Yes — GCash, Maya, and QRPH alongside cash, all rung up the same simple way at the till.",
  },
  {
    q: "How do I get started?",
    a: "Request a demo below. There’s no self-serve signup — our team onboards you personally, sets up your workspace, and trains your staff so you’re running from day one.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-28 bg-paper hairline-y">
      <div className="max-w-[1160px] mx-auto px-6">
        <div className="text-center max-w-[60ch] mx-auto reveal">
          <span className="text-[12.5px] font-bold tracking-widest uppercase text-brand-600">
            Answers
          </span>
          <h2 className="mt-4 text-[clamp(1.9rem,3.6vw,2.6rem)] leading-[1.1] tracking-tightest font-extrabold">
            Frequently asked questions
          </h2>
        </div>
        <div className="mt-12 max-w-[780px] mx-auto space-y-3 reveal">
          {faqs.map((f) => (
            <details key={f.q} className="group bg-white hairline rounded-[14px] px-6" open={f.open}>
              <summary className="flex items-center justify-between gap-4 cursor-pointer py-5 font-bold text-[1.02rem]">
                {f.q}
                <span className="faq-plus shrink-0">
                  <Icon name="plus" className="w-5 h-5 text-brand-600" strokeWidth={1.8} />
                </span>
              </summary>
              <p className="pb-5 text-ink-soft leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
