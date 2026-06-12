import { Icon, type IconName } from "@/app/components/Icon";
import { resolveAssetUrl } from "@/lib/images";

/**
 * Product-preview visual for the marketing detail pages. Following the landing
 * page's design idiom, this is a CSS/div "app mockup" — a windowed frame built
 * from hairlines and brand tints — not a photo, so it stays crisp, themeable
 * (Light & Dark), and dependency-free.
 *
 * It renders one of several distinct mini-UI layouts (`kind`) so that every
 * feature gets a visual that actually reflects what it does — a checkout, an
 * analytics board, an inventory list, a staff roster, a ticket board, or a
 * receipt. Each is filled with representative SAMPLE content (placeholder
 * peso amounts, product/staff names, order tickets) so the mockups read clearly
 * at a glance. Detail rows pick their kind from the feature icon via
 * `visualKindForIcon`.
 *
 * The soft glow sits inside the frame footprint (no negative insets) so the
 * visual is never clipped by an ancestor's `overflow-hidden` and never forces
 * horizontal scroll. A real `image` URL, if supplied, overrides the mockup.
 */
export type VisualKind = "preview" | "pos" | "analytics" | "list" | "roster" | "board" | "receipt";

/** Maps a feature icon to the most fitting mockup layout. */
export function visualKindForIcon(icon: IconName): VisualKind {
  switch (icon) {
    case "pos":
    case "cart":
    case "store":
    case "card":
    case "peso":
    case "wallet":
      return "pos";
    case "chart":
    case "pulse":
    case "trend":
    case "building":
      return "analytics";
    case "users":
    case "heart":
      return "roster";
    case "monitor":
    case "factory":
    case "grid":
    case "bolt":
    case "clock":
    case "gear":
      return "board";
    case "shield":
    case "receipt":
    case "check":
    case "lock":
    case "bell":
      return "receipt";
    default:
      return "list";
  }
}

export interface MarketingVisualProps {
  icon: IconName;
  label: string;
  /** Captions shown only by the `preview` kind (the hero's literal feature list). */
  rows?: string[];
  kind?: VisualKind;
  image?: string | null;
  className?: string;
}

/* ---- sample content (clearly placeholder demo data) ---- */
const POS_ITEMS = [
  { name: "Kapeng Barako", price: "₱120" },
  { name: "Milk Tea", price: "₱140" },
  { name: "Ensaymada", price: "₱85" },
  { name: "Ube Cake", price: "₱160" },
];
const ORDER = [
  { name: "Kapeng Barako ×2", price: "₱240" },
  { name: "Ensaymada ×1", price: "₱85" },
  { name: "Milk Tea ×1", price: "₱140" },
];
const STATS = [
  { label: "Sales today", value: "₱18,240" },
  { label: "Orders", value: "142" },
  { label: "Avg basket", value: "₱128" },
];
const WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const STOCK = [
  { name: "Arabica Beans 1kg", sub: "Stock 42", low: false },
  { name: "Oat Milk 1L", sub: "Stock 6", low: true },
  { name: "Paper Cups 16oz", sub: "Stock 310", low: false },
  { name: "Caramel Syrup", sub: "Stock 28", low: false },
];
const STAFF = [
  { name: "Maria Santos", role: "Cashier · On shift", on: true },
  { name: "Jose Cruz", role: "Barista", on: false },
  { name: "Ana Reyes", role: "Manager", on: true },
  { name: "Liza Tan", role: "Cashier", on: false },
];
const BOARD = [
  { head: "Queued", tickets: ["#1042 · Latte ×2", "#1043 · Ensaymada"] },
  { head: "In progress", tickets: ["#1041 · Ube Cake"] },
  { head: "Done", tickets: ["#1039 · Milk Tea", "#1040 · Barako ×3"] },
];
const RECEIPT_ITEMS = [
  { name: "Kapeng Barako", price: "₱120" },
  { name: "Ensaymada", price: "₱85" },
  { name: "Milk Tea", price: "₱140" },
];

/* ---- per-kind bodies ---- */
function PreviewBody({ icon, label, rows }: { icon: IconName; label: string; rows: string[] }) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-[12px] bg-brand-50 hairline text-brand-600 shrink-0">
          <Icon name={icon} className="w-5 h-5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-extrabold text-ink truncate">{label}</div>
          <div className="text-[11px] font-semibold text-ink-faint">What&apos;s included</div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <div key={r} className="flex items-center gap-3 hairline rounded-lg px-3 py-2.5 bg-paper">
            <span className="grid place-items-center w-4 h-4 rounded-full bg-accent-50 text-accent-600 shrink-0">
              <Icon name="check" className="w-3 h-3" strokeWidth={2.2} />
            </span>
            <span className="text-[12.5px] font-semibold text-ink truncate">{r}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 h-9 rounded-[10px] bg-gradient-to-r from-brand-600 to-accent-500 grid place-items-center">
        <span className="text-[12px] font-bold text-white tracking-wide">Request a Demo</span>
      </div>
    </div>
  );
}

function PosBody() {
  return (
    <div className="grid grid-cols-[1.3fr_1fr]">
      <div className="p-4 grid grid-cols-2 gap-2.5 content-start hairline-r">
        {POS_ITEMS.map((p) => (
          <div key={p.name} className="hairline rounded-lg p-2.5">
            <div className="w-6 h-6 rounded-md bg-brand-50 hairline mb-2 grid place-items-center">
              <Icon name="box" className="w-3.5 h-3.5 text-brand-600" strokeWidth={1.6} />
            </div>
            <div className="text-[11px] font-bold text-ink leading-tight truncate">{p.name}</div>
            <div className="text-[10.5px] text-ink-faint">{p.price}</div>
          </div>
        ))}
      </div>
      <div className="p-4 bg-paper flex flex-col">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-1.5">
          Current order
        </div>
        <div>
          {ORDER.map((o) => (
            <div key={o.name} className="flex items-center justify-between gap-2 py-1.5 hairline-b">
              <span className="text-[11px] text-ink-soft truncate">{o.name}</span>
              <span className="text-[11px] font-semibold text-ink shrink-0">{o.price}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Total</span>
            <span className="text-[1.05rem] font-extrabold tracking-tight text-ink">₱465</span>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {["GCash", "Maya", "QRPH", "Cash"].map((t, i) => (
              <span
                key={t}
                className={`text-[10px] font-bold rounded-md py-1.5 text-center ${
                  i === 3 ? "text-ink-soft bg-surface hairline" : "text-accent-600 bg-accent-50"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsBody() {
  return (
    <div className="p-5">
      <div className="grid grid-cols-3 gap-2.5">
        {STATS.map((s) => (
          <div key={s.label} className="hairline rounded-lg p-3 bg-paper">
            <div className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint truncate">
              {s.label}
            </div>
            <div className="mt-1 text-[15px] font-extrabold tracking-tight text-ink">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 hairline rounded-lg p-4 bg-paper">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
            This week
          </span>
          <span className="text-[10px] font-bold text-accent-600">▲ 12%</span>
        </div>
        <div className="flex items-end gap-2 h-20">
          {[58, 40, 74, 52, 88, 66, 95].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand-200 to-brand-500"
                style={{ height: `${h}%` }}
              />
              <span className="text-[9px] font-semibold text-ink-faint">{WEEK[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListBody() {
  return (
    <div className="p-4 space-y-2.5">
      {STOCK.map((s) => (
        <div key={s.name} className="flex items-center gap-3 hairline rounded-lg p-2.5 bg-paper">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-brand-50 hairline text-brand-600 shrink-0">
            <Icon name="box" className="w-4 h-4" strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-ink truncate">{s.name}</div>
            <div className="text-[10.5px] text-ink-faint">{s.sub}</div>
          </div>
          <span
            className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${
              s.low ? "text-brand-700 bg-brand-50" : "text-accent-600 bg-accent-50"
            }`}
          >
            {s.low ? "Low" : "OK"}
          </span>
        </div>
      ))}
    </div>
  );
}

function RosterBody() {
  return (
    <div className="p-4 space-y-2.5">
      {STAFF.map((m) => (
        <div key={m.name} className="flex items-center gap-3 hairline rounded-lg p-2.5 bg-paper">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-50 hairline text-brand-600 shrink-0">
            <Icon name="users" className="w-4 h-4" strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-ink truncate">{m.name}</div>
            <div className="text-[10.5px] text-ink-faint truncate">{m.role}</div>
          </div>
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.on ? "bg-accent-500" : "bg-ink/15"}`}
          />
        </div>
      ))}
    </div>
  );
}

function BoardBody() {
  return (
    <div className="p-4 grid grid-cols-3 gap-2.5">
      {BOARD.map((c) => (
        <div key={c.head} className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            <span className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint truncate">
              {c.head}
            </span>
          </div>
          {c.tickets.map((t) => (
            <div key={t} className="hairline rounded-lg p-2 bg-paper">
              <div className="text-[10px] font-semibold text-ink leading-tight">{t}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ReceiptBody() {
  return (
    <div className="p-5 grid place-items-center">
      <div className="w-[70%] rounded-lg bg-paper hairline p-4">
        <div className="flex flex-col items-center">
          <span className="text-[12px] font-extrabold text-ink">VendoPOS Café</span>
          <span className="text-[9.5px] font-semibold text-ink-faint">Official Receipt</span>
        </div>
        <div className="mt-2.5 border-t border-dashed border-ink/15 pt-2.5 space-y-1.5">
          {RECEIPT_ITEMS.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-ink-soft truncate">{r.name}</span>
              <span className="text-[10.5px] font-semibold text-ink shrink-0">{r.price}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 border-t border-dashed border-ink/15 pt-2.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
            Total (VAT incl.)
          </span>
          <span className="text-[12px] font-extrabold text-ink">₱345</span>
        </div>
        <div className="flex gap-[3px] pt-3">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="flex-1 bg-ink/70 rounded-[1px]"
              style={{ height: "20px", opacity: i % 3 === 0 ? 1 : 0.5 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketingVisual({
  icon,
  label,
  rows = [],
  kind = "preview",
  image,
  className = "",
}: MarketingVisualProps) {
  const src = resolveAssetUrl(image);

  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-2 -z-10 bg-brand-100 blur-2xl opacity-60 rounded-[28px]" />
      <div className="rounded-xl2 bg-surface hairline shadow-soft overflow-hidden">
        {/* window chrome */}
        <div className="flex items-center gap-2 px-5 h-11 hairline-b bg-paper">
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="w-2.5 h-2.5 rounded-full bg-ink/15" />
          <span className="ml-auto text-[12px] font-semibold text-ink-faint tracking-wide truncate max-w-[62%]">
            VendoPOS · {label}
          </span>
        </div>

        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${label} preview`} className="w-full h-auto block" />
        ) : kind === "preview" ? (
          <PreviewBody icon={icon} label={label} rows={rows} />
        ) : kind === "pos" ? (
          <PosBody />
        ) : kind === "analytics" ? (
          <AnalyticsBody />
        ) : kind === "roster" ? (
          <RosterBody />
        ) : kind === "board" ? (
          <BoardBody />
        ) : kind === "receipt" ? (
          <ReceiptBody />
        ) : (
          <ListBody />
        )}
      </div>
    </div>
  );
}
