"use client";

import { useState } from "react";
import { Icon, IconSprite, type IconName } from "../../components/Icon";
import { BrandMark } from "../../components/BrandMark";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import { TenantTheme } from "../../components/theme/TenantTheme";
import { useTheme } from "../../components/theme/ThemeProvider";

/**
 * STATELESS redesign mock of the POS register (taste-skill, /pos pilot).
 *
 * No business logic — no cart math, no hooks, no fetches. Dummy data only, so we
 * can audit the high-density, touch-first layout + tenant-theme + dark-mode
 * bindings completely risk-free before porting the look into the real
 * PosTerminal container. Dials: VARIANCE 3 / DENSITY 7, tap targets >=44px.
 *
 * Once signed off, the presentational pieces here (Header / Catalog / ProductTile
 * / OrderPanel / Line / Stepper) become the children the real container renders,
 * receiving its existing state + handlers as explicit props.
 */

/** Dummy centavos → "₱1,234.50" (display only; the real peso() lives in lib). */
const peso = (cents: number) =>
  "₱" + (cents / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORIES = ["Coffee", "Pastries", "Mains", "Drinks", "Retail"] as const;
type Category = (typeof CATEGORIES)[number];

type MockProduct = { id: string; name: string; priceCents: number; stock: number; low?: boolean; soldOut?: boolean };
const PRODUCTS: MockProduct[] = [
  { id: "p1", name: "Barako Single Origin", priceCents: 14000, stock: 24 },
  { id: "p2", name: "Spanish Latte", priceCents: 15500, stock: 18 },
  { id: "p3", name: "Cappuccino", priceCents: 13500, stock: 12 },
  { id: "p4", name: "Cold Brew 16oz", priceCents: 16500, stock: 3, low: true },
  { id: "p5", name: "Caramel Macchiato", priceCents: 17000, stock: 20 },
  { id: "p6", name: "Flat White", priceCents: 15000, stock: 9 },
  { id: "p7", name: "Dirty Matcha", priceCents: 18000, stock: 0, soldOut: true },
  { id: "p8", name: "Americano", priceCents: 12000, stock: 31 },
  { id: "p9", name: "Mocha", priceCents: 16000, stock: 14 },
  { id: "p10", name: "Hazelnut Latte", priceCents: 17500, stock: 6, low: true },
  { id: "p11", name: "Espresso Doppio", priceCents: 11000, stock: 40 },
  { id: "p12", name: "Tablea Hot Choco", priceCents: 14500, stock: 22 },
];

const LINES = [
  { id: "p2", name: "Spanish Latte", unitCents: 15500, qty: 2 },
  { id: "p4", name: "Cold Brew 16oz", unitCents: 16500, qty: 1 },
  { id: "p12", name: "Tablea Hot Choco", unitCents: 14500, qty: 1 },
];

// Sample tenant accents — these hexes are accent INPUT data fed to the theme
// engine (which derives the --color-brand-* ramp), not styling literals. They
// let us audit legibility across hues in both light and dark.
const ACCENTS: { label: string; hex: string | null }[] = [
  { label: "Default blue", hex: null },
  { label: "Espresso", hex: "#6f4e37" },
  { label: "Appetite red", hex: "#e23744" },
  { label: "Forest", hex: "#0d7a4f" },
  { label: "Violet", hex: "#7c3aed" },
];

export function PosTerminalMock() {
  const { theme } = useTheme();
  const [accent, setAccent] = useState<string | null>(null);
  const [cat, setCat] = useState<Category>("Coffee");

  return (
    <div className="h-screen flex flex-col bg-paper">
      {/* One sprite for the whole document (audit bar + terminal icons). */}
      <IconSprite />
      <PreviewBar accent={accent} onAccent={setAccent} />

      {/* Themed register root — mirrors PosTerminal's wrapper so [data-vp-theme],
          the tenant accent, and the .dark retint are all genuinely exercised. */}
      <div
        data-vp-theme=""
        className={
          "theme-root flex-1 min-h-0 flex flex-col bg-paper text-ink overflow-hidden " +
          (theme === "dark" ? "dark" : "")
        }
      >
        <TenantTheme accent={accent} />
        <Header />
        <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_400px]">
          <Catalog cat={cat} setCat={setCat} />
          <OrderPanel />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- preview bar ------------------------------- */

function PreviewBar({ accent, onAccent }: { accent: string | null; onAccent: (hex: string | null) => void }) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 h-11 bg-surface-2 hairline-b">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
        Preview · POS mock · stateless
      </span>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden sm:inline text-[11px] font-semibold text-ink-faint">Tenant accent</span>
        <div className="flex items-center gap-1">
          {ACCENTS.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onAccent(a.hex)}
              title={a.label}
              aria-label={a.label}
              className={"w-6 h-6 rounded-full hairline press " + (accent === a.hex ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-2" : "")}
              style={{ background: a.hex ?? "var(--color-brand-500)" }}
            />
          ))}
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

/* --------------------------------- header --------------------------------- */

function Header() {
  return (
    <header className="relative z-20 shrink-0 glass hairline-b">
      <div className="flex items-center gap-3 px-4 sm:px-5 h-16">
        <button
          type="button"
          className="tap inline-flex items-center gap-2 rounded-[10px] bg-surface hairline px-3 text-[13px] font-semibold text-ink-soft press hover:text-brand-600 hover:border-brand-200"
        >
          <Icon name="arrow" className="w-[18px] h-[18px] rotate-180" strokeWidth={1.8} />
          <span className="hidden sm:inline">Exit to dashboard</span>
        </button>

        <div className="flex items-center gap-2.5">
          <BrandMark className="w-9 h-9" />
          <div className="leading-tight">
            <div className="font-extrabold text-[15px] tracking-tightest">Kapè Manila</div>
            <div className="text-[11px] font-semibold text-ink-faint flex items-center gap-1.5">
              <Icon name="lock" className="w-3 h-3" strokeWidth={1.8} />
              Register 1 · locked terminal
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <HeaderChip icon="wallet" label="Open drawer" />
          <HeaderChip icon="refresh" label="Returns" />
          <HeaderChip icon="monitor" label="Customer display" />
          <div className="hidden md:flex items-center gap-2.5 rounded-[10px] bg-surface hairline px-3 h-11">
            <span className="w-7 h-7 rounded-full bg-accent-500 text-white grid place-items-center font-bold text-[12px]">A</span>
            <div className="leading-tight">
              <div className="text-[12.5px] font-bold tracking-tight">Aria Santos</div>
              <div className="text-[10.5px] font-semibold text-ink-faint tabular-nums">Drawer · ₱5,000.00</div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            className="tap grid place-items-center w-11 rounded-[10px] bg-surface hairline text-ink-soft press hover:text-rose-600 hover:border-rose-200"
          >
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}

function HeaderChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      title={label}
      className="tap inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 text-[13px] font-semibold text-ink-soft press hover:text-brand-600 hover:border-brand-200"
    >
      <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

/* --------------------------------- catalog -------------------------------- */

function Catalog({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  return (
    <div className="flex flex-col min-h-0 p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <label className="relative flex-1">
          <Icon name="search" className="w-[16px] h-[16px] text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            readOnly
            placeholder="Search or scan barcode…"
            className="field-input tap rounded-[10px] pl-9 pr-3 text-[14px] w-full"
          />
        </label>
        <span className="tap hidden sm:inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 text-[12px] font-bold text-ink-faint">
          <Icon name="bolt" className="w-[15px] h-[15px]" strokeWidth={1.8} />
          Scan ready
        </span>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={
              "tap shrink-0 px-4 rounded-[10px] text-[13.5px] font-semibold press " +
              (cat === c ? "bg-brand-600 text-white shadow-btn" : "bg-surface hairline text-ink-soft hover:text-ink")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
          {PRODUCTS.map((p, i) => (
            <ProductTile key={p.id} product={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductTile({ product, index }: { product: MockProduct; index: number }) {
  const soldOut = !!product.soldOut;
  return (
    <button
      type="button"
      disabled={soldOut}
      style={{ animationDelay: `${Math.min(index, 11) * 25}ms` }}
      className={
        "rise relative text-left rounded-xl2 bg-surface hairline shadow-card p-3 press " +
        (soldOut ? "opacity-60 cursor-not-allowed" : "hover:border-brand-200 hover:shadow-soft")
      }
    >
      <div
        className="relative rounded-lg bg-paper hairline overflow-hidden grid place-items-center mb-2.5"
        style={{ aspectRatio: "1 / 1" }}
      >
        <Icon name="image" className="w-8 h-8 text-ink-faint" strokeWidth={1.5} />
        {product.low && !soldOut && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10.5px] font-bold tabular-nums">
            {product.stock} left
          </span>
        )}
        {soldOut ? (
          <span className="absolute inset-0 grid place-items-center bg-surface/55">
            <span className="rounded-full bg-ink text-paper px-3 py-1 text-[11px] font-bold tracking-tight">Sold out</span>
          </span>
        ) : (
          <span className="absolute bottom-1.5 right-1.5 w-8 h-8 rounded-full bg-brand-600 text-white grid place-items-center shadow-btn">
            <Icon name="plus" className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
        )}
      </div>

      <div className="font-bold tracking-tight leading-tight line-clamp-2">{product.name}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[15px] font-extrabold tracking-tight tabular-nums">{peso(product.priceCents)}</span>
        <span className="shrink-0 text-[11px] font-semibold text-ink-faint">{soldOut ? "—" : `${product.stock} in stock`}</span>
      </div>
    </button>
  );
}

/* ------------------------------- order panel ------------------------------ */

function OrderPanel() {
  return (
    <aside className="hidden lg:flex flex-col bg-surface min-h-0 hairline-l">
      <div className="shrink-0 flex items-center justify-between px-5 py-4 hairline-b">
        <h2 className="font-extrabold tracking-tight flex items-center gap-2">
          <Icon name="cart" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
          Current order
          <span className="ml-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-[11px] font-extrabold tabular-nums">4</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <OrderAction icon="tag" label="Discount" />
          <OrderAction icon="ban" label="Void" danger />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2.5">
        {LINES.map((l, i) => (
          <Line key={l.id} line={l} index={i} />
        ))}
      </div>

      <div className="shrink-0 px-5 py-4 hairline-t space-y-3">
        <div className="space-y-1.5 text-[13px]">
          <Row label="Items (4)" value="₱620.00" />
          <div className="flex items-center justify-between text-accent-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <Icon name="tag" className="w-[14px] h-[14px]" strokeWidth={1.8} />
              10% off
            </span>
            <span className="tabular-nums">−₱62.00</span>
          </div>
          <Row label="VAT (12% incl.)" value="₱59.79" muted />
          <div className="flex items-end justify-between pt-2 mt-1 hairline-t">
            <span className="text-[14px] font-bold">Total</span>
            <span className="text-stat font-extrabold tracking-tightest tabular-nums">₱558.00</span>
          </div>
        </div>

        <button
          type="button"
          className="tap w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand-500 hover:bg-brand-600 min-h-[56px] font-semibold text-white shadow-btn tracking-tight press"
        >
          <Icon name="bolt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
          Checkout · ₱558.00
        </button>
      </div>
    </aside>
  );
}

function OrderAction({ icon, label, danger }: { icon: IconName; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      className={
        "tap inline-flex items-center gap-1.5 rounded-[9px] bg-paper hairline px-2.5 text-[12px] font-bold text-ink-soft press " +
        (danger ? "hover:text-rose-600 hover:border-rose-200" : "hover:text-brand-600 hover:border-brand-200")
      }
    >
      <Icon name={icon} className="w-[15px] h-[15px]" strokeWidth={1.7} />
      {label}
    </button>
  );
}

function Line({ line, index }: { line: { id: string; name: string; unitCents: number; qty: number }; index: number }) {
  return (
    <div className="rise flex items-center gap-3" style={{ animationDelay: `${index * 30}ms` }}>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-bold tracking-tight truncate">{line.name}</div>
        <div className="text-[12px] text-ink-faint tabular-nums">{peso(line.unitCents)} ea</div>
      </div>
      <div className="flex items-center gap-1">
        <Stepper symbol="−" label="decrease quantity" />
        <span className="w-7 text-center text-[14px] font-bold tabular-nums">{line.qty}</span>
        <Stepper symbol="+" label="increase quantity" />
      </div>
      <div className="w-[72px] text-right text-[13.5px] font-bold tracking-tight tabular-nums">
        {peso(line.unitCents * line.qty)}
      </div>
    </div>
  );
}

function Stepper({ symbol, label }: { symbol: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="tap grid place-items-center rounded-[9px] bg-paper hairline text-ink-soft text-[18px] font-bold leading-none press hover:text-brand-600 hover:border-brand-200"
    >
      {symbol}
    </button>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-ink-faint" : "text-ink-soft"}>{label}</span>
      <span className={"tabular-nums " + (muted ? "text-ink-faint" : "font-semibold")}>{value}</span>
    </div>
  );
}
