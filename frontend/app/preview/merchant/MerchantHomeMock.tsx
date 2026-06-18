"use client";

import { useState } from "react";
import { Icon, IconSprite, type IconName } from "../../components/Icon";
import { ThemeToggle } from "../../components/theme/ThemeToggle";
import { TenantTheme } from "../../components/theme/TenantTheme";
import { useTheme } from "../../components/theme/ThemeProvider";

/**
 * STATELESS redesign mock of the merchant/owner dashboard (taste-skill, Phase 2).
 *
 * No data fetching, no hooks beyond local audit toggles — dummy data only, so we
 * can audit the dense, architectural dashboard + tenant-theme + dark-mode
 * bindings risk-free before porting into the real MerchantHome container.
 * Dials: VARIANCE 4 / DENSITY 8 / MOTION 3 (snap entrances, fast hover lifts).
 *
 * Target danger zones: (1) the metric strip — oversized tight-tracked figures
 * with a .rise cascade; (2) tabular operations matrices — high-density tables
 * (cashier shifts, inventory shortages) ruled by hairlines, not heavy shadows;
 * (3) multi-tenant theming — every cell reads --color-* tokens, so a brand swap
 * recolours the whole report instantly.
 */

const initials = (name: string) =>
  name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

// Accent INPUT data for the theme engine (not styling literals) — audits hue
// legibility across light/dark. Mirrors the POS mock.
const ACCENTS: { label: string; hex: string | null }[] = [
  { label: "Default blue", hex: null },
  { label: "Espresso", hex: "#6f4e37" },
  { label: "Appetite red", hex: "#e23744" },
  { label: "Forest", hex: "#0d7a4f" },
  { label: "Violet", hex: "#7c3aed" },
];

type Kpi = { icon: IconName; label: string; value: string; delta: string; dir: "up" | "down" | "warn" };
const KPIS: Kpi[] = [
  { icon: "peso", label: "Sales today", value: "₱48,250", delta: "+12.4%", dir: "up" },
  { icon: "receipt", label: "Transactions", value: "312", delta: "+38", dir: "up" },
  { icon: "cart", label: "Avg. order value", value: "₱154.65", delta: "−2.1%", dir: "down" },
  { icon: "box", label: "Items sold", value: "1,204", delta: "18 low", dir: "warn" },
];

const HOURS = ["7a", "8a", "9a", "10a", "11a", "12p", "1p", "2p", "3p", "4p", "5p", "6p"];
const HOURLY = [12, 28, 44, 39, 64, 81, 72, 96, 88, 70, 52, 38];

type Channel = { method: string; pct: number; amount: string; tone: string };
const CHANNELS: Channel[] = [
  { method: "GCash", pct: 42, amount: "₱20,265", tone: "bg-brand-500" },
  { method: "Cash", pct: 31, amount: "₱14,958", tone: "bg-ink-faint" },
  { method: "Maya", pct: 18, amount: "₱8,685", tone: "bg-accent-500" },
  { method: "QRPH", pct: 9, amount: "₱4,342", tone: "bg-brand-400" },
];

type Shift = {
  cashier: string; reg: string; opened: string; sales: string; drawer: string;
  variance: string; state: "balanced" | "short" | "over" | "open";
};
const SHIFTS: Shift[] = [
  { cashier: "Aria Santos", reg: "Register 1", opened: "7:58a", sales: "₱18,420", drawer: "₱23,420", variance: "₱0", state: "balanced" },
  { cashier: "Marco Reyes", reg: "Register 2", opened: "8:03a", sales: "₱14,980", drawer: "₱19,930", variance: "−₱50", state: "short" },
  { cashier: "Lena Cruz", reg: "Register 3", opened: "9:12a", sales: "₱9,210", drawer: "₱14,260", variance: "+₱20", state: "over" },
  { cashier: "Pia Gomez", reg: "Kiosk", opened: "10:30a", sales: "₱5,640", drawer: "—", variance: "—", state: "open" },
];

type Short = { item: string; sku: string; onHand: number; reorder: number; status: "out" | "critical" | "low" };
const SHORTAGES: Short[] = [
  { item: "Oat Milk 1L", sku: "MLK-001", onHand: 0, reorder: 12, status: "out" },
  { item: "Cold Brew 16oz", sku: "BEV-016", onHand: 3, reorder: 10, status: "critical" },
  { item: "Dirty Matcha", sku: "BEV-031", onHand: 0, reorder: 6, status: "out" },
  { item: "Hazelnut Syrup", sku: "SYR-114", onHand: 6, reorder: 8, status: "low" },
  { item: "Paper Cups 12oz", sku: "PKG-120", onHand: 48, reorder: 200, status: "low" },
];

const TOP = [
  { name: "Spanish Latte", qty: 86, rev: "₱13,330" },
  { name: "Cold Brew 16oz", qty: 64, rev: "₱10,560" },
  { name: "Cappuccino", qty: 52, rev: "₱7,020" },
  { name: "Americano", qty: 47, rev: "₱5,640" },
  { name: "Tablea Hot Choco", qty: 39, rev: "₱5,655" },
];

export function MerchantHomeMock() {
  const { theme } = useTheme();
  const [accent, setAccent] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <IconSprite />
      <PreviewBar accent={accent} onAccent={setAccent} />

      {/* Themed workspace root — mirrors DashShell so [data-vp-theme], the tenant
          accent, and the .dark retint are genuinely exercised. */}
      <div
        data-vp-theme=""
        className={"theme-root flex-1 min-h-0 overflow-y-auto bg-paper text-ink " + (theme === "dark" ? "dark" : "")}
      >
        <TenantTheme accent={accent} />
        <div className="mx-auto max-w-[1180px] px-5 sm:px-8 py-7 space-y-6">
          <Greeting />
          <MetricStrip />

          <div className="grid gap-5 lg:grid-cols-3">
            <RevenueVelocity />
            <ChannelMix />
          </div>

          <CashierShifts />

          <div className="grid gap-5 lg:grid-cols-3">
            <InventoryShortages />
            <TopSellers />
          </div>
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
        Preview · Merchant dashboard · stateless
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

/* -------------------------------- greeting -------------------------------- */

function Greeting() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-hero font-extrabold tracking-tightest">Kumusta, Aria 👋</h2>
        <p className="text-note text-ink-soft">
          Here&apos;s how <span className="font-semibold text-ink">Kapè Manila</span> is doing today.
        </p>
      </div>
      <button
        type="button"
        className="lift press inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight"
      >
        <Icon name="pos" className="w-[18px] h-[18px]" strokeWidth={1.7} />
        Open register
      </button>
    </div>
  );
}

/* ------------------------------ metric strip ------------------------------ */

function MetricStrip() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((k, i) => (
        <div
          key={k.label}
          style={{ animationDelay: `${i * 60}ms` }}
          className="rise lift rounded-xl2 bg-surface hairline shadow-card p-5"
        >
          <div className="flex items-center justify-between">
            <span
              className={
                "grid place-items-center w-9 h-9 rounded-[10px] " +
                (k.dir === "warn" ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600")
              }
            >
              <Icon name={k.icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
            </span>
            <Delta delta={k.delta} dir={k.dir} />
          </div>
          <div className="mt-3 text-stat font-extrabold tracking-tightest tabular-nums">{k.value}</div>
          <div className="mt-1.5 text-cap font-semibold uppercase tracking-wide text-ink-faint">{k.label}</div>
        </div>
      ))}
    </div>
  );
}

function Delta({ delta, dir }: { delta: string; dir: Kpi["dir"] }) {
  if (dir === "warn") {
    return (
      <span className="inline-flex items-center gap-1 text-fine font-bold text-amber-600 tabular-nums">
        <Icon name="box" className="w-3.5 h-3.5" strokeWidth={2} />
        {delta}
      </span>
    );
  }
  const up = dir === "up";
  return (
    <span className={"inline-flex items-center gap-1 text-fine font-bold tabular-nums " + (up ? "text-accent-600" : "text-rose-600")}>
      <Icon name="trend" className={"w-3.5 h-3.5 " + (up ? "" : "-scale-y-100")} strokeWidth={2} />
      {delta}
    </span>
  );
}

/* ---------------------------- revenue velocity ---------------------------- */

function RevenueVelocity() {
  const peak = Math.max(...HOURLY);
  return (
    <div className="lg:col-span-2 rounded-xl2 bg-surface hairline-strong shadow-soft p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-extrabold tracking-tight">Revenue velocity</h3>
          <div className="mt-1 text-hero font-extrabold tracking-tightest tabular-nums">₱48,250</div>
        </div>
        <span className="text-fine font-semibold text-ink-faint">today, by hour</span>
      </div>
      <div className="mt-6 flex items-end justify-between gap-1.5 h-[150px]">
        {HOURLY.map((h, i) => (
          <div key={HOURS[i]} className="group flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="w-full flex-1 flex items-end">
              <div
                style={{ height: `${Math.max(4, (h / peak) * 100)}%` }}
                className="w-full rounded-t-[6px] bg-brand-500/90 hover:bg-brand-600 transition-[background-color] duration-150"
              />
            </div>
            <span className="text-cap font-semibold text-ink-faint">{HOURS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- channel mix ------------------------------ */

function ChannelMix() {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <h3 className="font-extrabold tracking-tight">Payment mix</h3>
      <p className="mt-1 text-fine text-ink-soft">
        <span className="font-bold text-ink">69%</span> e-wallet · <span className="font-bold text-ink">31%</span> cash
      </p>
      <div className="mt-4 flex h-2.5 rounded-full overflow-hidden bg-paper hairline">
        {CHANNELS.map((c) => (
          <span key={c.method} className={c.tone} style={{ width: `${c.pct}%` }} title={`${c.method}: ${c.amount}`} />
        ))}
      </div>
      <div className="mt-4 space-y-2.5">
        {CHANNELS.map((c) => (
          <div key={c.method} className="flex items-center gap-2.5 text-note">
            <span className={"w-2.5 h-2.5 rounded-full " + c.tone} />
            <span className="font-semibold">{c.method}</span>
            <span className="ml-auto text-ink-soft tabular-nums">{c.pct}%</span>
            <span className="w-[80px] text-right font-bold tracking-tight tabular-nums">{c.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------- tabular: cashier shifts ----------------------- */

const VARIANCE_TONE: Record<Shift["state"], string> = {
  balanced: "text-accent-600",
  short: "text-rose-600",
  over: "text-amber-600",
  open: "text-ink-faint",
};

function CashierShifts() {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="font-extrabold tracking-tight">Active cashier shifts</h3>
        <span className="text-cap font-bold rounded-full px-2.5 py-0.5 text-brand-700 bg-brand-50">4 open drawers</span>
      </div>
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-cap uppercase tracking-wide text-ink-faint">
              <Th className="pr-3">Cashier</Th>
              <Th className="px-3">Register</Th>
              <Th className="px-3">Opened</Th>
              <Th className="px-3 text-right">Sales</Th>
              <Th className="px-3 text-right">Expected drawer</Th>
              <Th className="pl-3 text-right">Variance</Th>
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map((s, i) => (
              <tr key={s.cashier} style={{ animationDelay: `${i * 40}ms` }} className="rise hairline-t">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 shrink-0 rounded-full bg-accent-500 text-white grid place-items-center font-bold text-[11px]">
                      {initials(s.cashier)}
                    </span>
                    <span className="text-note font-bold tracking-tight">{s.cashier}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-note text-ink-soft">{s.reg}</td>
                <td className="py-3 px-3 text-note text-ink-soft tabular-nums">{s.opened}</td>
                <td className="py-3 px-3 text-note font-semibold text-right tabular-nums">{s.sales}</td>
                <td className="py-3 px-3 text-note font-semibold text-right tabular-nums">{s.drawer}</td>
                <td className={"py-3 pl-3 text-note font-bold text-right tabular-nums " + VARIANCE_TONE[s.state]}>
                  {s.variance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------ tabular: inventory shortages -------------------- */

const STATUS_BADGE: Record<Short["status"], { label: string; className: string }> = {
  out: { label: "Out of stock", className: "bg-rose-600 text-white" },
  critical: { label: "Critical", className: "bg-amber-600 text-white" },
  low: { label: "Low", className: "bg-brand-600 text-white" },
};

function InventoryShortages() {
  return (
    <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="font-extrabold tracking-tight">Inventory shortages</h3>
        <span className="text-cap font-bold rounded-full px-2.5 py-0.5 text-amber-600 bg-amber-50">5 to reorder</span>
      </div>
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-cap uppercase tracking-wide text-ink-faint">
              <Th className="pr-3">Item</Th>
              <Th className="px-3">SKU</Th>
              <Th className="px-3 text-right">On hand</Th>
              <Th className="px-3 text-right">Reorder at</Th>
              <Th className="px-3">Status</Th>
              <Th className="pl-3 text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {SHORTAGES.map((s, i) => {
              const badge = STATUS_BADGE[s.status];
              return (
                <tr key={s.sku} style={{ animationDelay: `${i * 40}ms` }} className="rise hairline-t">
                  <td className="py-3 pr-3 text-note font-bold tracking-tight">{s.item}</td>
                  <td className="py-3 px-3 text-fine text-ink-faint tabular-nums">{s.sku}</td>
                  <td className={"py-3 px-3 text-note font-bold text-right tabular-nums " + (s.onHand === 0 ? "text-rose-600" : "text-ink")}>
                    {s.onHand}
                  </td>
                  <td className="py-3 px-3 text-note text-ink-soft text-right tabular-nums">{s.reorder}</td>
                  <td className="py-3 px-3">
                    <span className={"inline-block rounded-full px-2.5 py-0.5 text-cap font-bold tracking-tight " + badge.className}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      className="press inline-flex items-center gap-1.5 rounded-[8px] bg-paper hairline px-2.5 py-1.5 text-cap font-bold text-ink-soft hover:text-brand-600 hover:border-brand-200"
                    >
                      <Icon name="truck" className="w-[14px] h-[14px]" strokeWidth={1.7} />
                      Draft PO
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------- top sellers ------------------------------ */

function TopSellers() {
  const peak = Math.max(...TOP.map((t) => t.qty));
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <h3 className="font-extrabold tracking-tight">Top sellers today</h3>
      <div className="mt-4 space-y-3">
        {TOP.map((t, i) => (
          <div key={t.name} style={{ animationDelay: `${i * 40}ms` }} className="rise">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-note font-semibold truncate">{t.name}</span>
              <span className="text-fine font-bold tracking-tight tabular-nums shrink-0">{t.qty}×</span>
            </div>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="flex-1 h-1.5 rounded-full bg-paper hairline overflow-hidden">
                <span className="block h-full rounded-full bg-accent-500" style={{ width: `${(t.qty / peak) * 100}%` }} />
              </span>
              <span className="w-[72px] text-right text-fine text-ink-soft tabular-nums">{t.rev}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={"font-semibold pb-2.5 whitespace-nowrap " + className}>{children}</th>;
}
