import { Icon, type IconName } from "@/app/components/Icon";

/**
 * Platform-level proof strip (BIR / e-wallets / offline / peso) shared across
 * the marketing detail pages. Kept separate from page-specific content so it
 * never overlaps or repeats a page's own feature claims.
 */
const TRUST: { icon: IconName; label: string }[] = [
  { icon: "receipt", label: "BIR-ready receipts" },
  { icon: "card", label: "GCash · Maya · QRPH" },
  { icon: "wifi-off", label: "Works offline" },
  { icon: "peso", label: "Peso-first" },
];

export function TrustStrip() {
  return (
    <section className="bg-surface hairline-b">
      <div className="max-w-[1160px] mx-auto px-6 py-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        {TRUST.map((t) => (
          <div key={t.label} className="flex items-center gap-2.5 text-ink-soft">
            <Icon name={t.icon} className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
            <span className="text-[14px] font-semibold">{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
