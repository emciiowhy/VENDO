import { Icon } from "./Icon";

export function TrustBar() {
  return (
    <div className="hairline-y bg-paper">
      <div className="max-w-[1160px] mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <Icon name="receipt" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.6} />
          BIR-ready receipts &amp; reports
        </div>
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <Icon name="wifi-off" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.6} />
          Offline-capable POS
        </div>
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <Icon name="card" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.6} />
          GCash · Maya · QRPH
        </div>
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <Icon name="shield" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.6} />
          Isolated per-business data
        </div>
        <div className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <span className="w-[18px] h-[18px] grid place-items-center text-brand-600 font-extrabold text-[15px] leading-none">
            ₱
          </span>
          Peso-first, end to end
        </div>
      </div>
    </div>
  );
}
