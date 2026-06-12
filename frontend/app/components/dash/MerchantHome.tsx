"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "../Icon";
import { formatCents, formatCentsWhole, formatCount } from "@/lib/format";
import { useDashUser } from "./DashShell";
import { PasswordOnboarding } from "./PasswordOnboarding";
import { useToast } from "../Toast";
import {
  getDashboardPulse,
  getStockAlerts,
  type DashboardPulse,
  type StockAlert,
} from "@/lib/merchant";
import { MERCHANT_EVENTS_URL, type LowStockEvent } from "@/lib/merchantEvents";

/**
 * Merchant owner/manager landing — a single-Tenant snapshot driven entirely by
 * live aggregation (no mock arrays): today's takings, hourly revenue velocity,
 * payment-channel mix and best sellers, all from the `sales`/`sale_items`
 * ledger, plus a live low-stock alert banner from the catalog. Quick access to
 * the seven Modules stays as navigation (POS + Inventory live, rest "soon").
 */

const MODULES: { icon: IconName; label: string; desc: string; href?: string }[] = [
  { icon: "pos", label: "Point of Sale", desc: "Ring up & take payment", href: "/pos" },
  { icon: "box", label: "Inventory", desc: "Items, prices & stock", href: "/dashboard/inventory" },
  { icon: "file", label: "Compliance", desc: "BIR sales ledger & VAT", href: "/dashboard/compliance" },
  { icon: "chart", label: "Finance", desc: "Profit, loss & expenses", href: "/dashboard/finance" },
  { icon: "truck", label: "Procurement", desc: "Suppliers & POs", href: "/dashboard/procurement" },
  { icon: "factory", label: "Manufacturing", desc: "Recipes & BOM", href: "/dashboard/manufacturing" },
  { icon: "users", label: "HR", desc: "Staff & payroll", href: "/dashboard/hr" },
  { icon: "heart", label: "CRM", desc: "Customers & loyalty", href: "/dashboard/crm" },
];

const METHOD_STYLE: Record<string, string> = {
  GCash: "bg-brand-500",
  Maya: "bg-accent-500",
  QRPH: "bg-brand-400",
  Cash: "bg-ink-faint",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; pulse: DashboardPulse; alerts: StockAlert[] };

export function MerchantHome() {
  const user = useDashUser();
  const store = user.tenantName ?? "your store";
  const { push } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [pulseRes, alertsRes] = await Promise.all([getDashboardPulse(), getStockAlerts()]);
      if (!alive) return;
      if (pulseRes.ok && alertsRes.ok) {
        setState({ status: "ready", pulse: pulseRes.pulse, alerts: alertsRes.alerts });
      } else {
        setState({
          status: "error",
          message:
            (!pulseRes.ok && pulseRes.error) ||
            (!alertsRes.ok && alertsRes.error) ||
            "Could not load your dashboard.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Real-time low-stock alerts: subscribe to the merchant event stream and
  // raise a toast (+ live-merge into the panel) the moment a sale drops a
  // product to/below its threshold. setState fires only from the SSE callback.
  useEffect(() => {
    const es = new EventSource(MERCHANT_EVENTS_URL, { withCredentials: true });
    es.addEventListener("low-stock", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as LowStockEvent;
      push({
        variant: ev.depleted ? "danger" : "warning",
        title: ev.depleted ? `${ev.name} is out of stock` : `${ev.name} is running low`,
        message: ev.depleted
          ? "Restock before the next sale."
          : `${ev.stock} left · reorder at ${ev.lowStockThreshold}.`,
      });
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        const alerts = [
          { id: ev.id, name: ev.name, sku: ev.sku, stock: ev.stock, lowStockThreshold: ev.lowStockThreshold, depleted: ev.depleted },
          ...prev.alerts.filter((a) => a.id !== ev.id),
        ].sort((a, b) => a.stock - b.stock);
        return { ...prev, alerts, pulse: { ...prev.pulse, lowStockCount: alerts.length } };
      });
    });
    return () => es.close();
  }, [push]);

  return (
    <div className="space-y-7 max-w-[1180px]">
      {/* First-run: prompt password-less owners/managers to set one. */}
      <PasswordOnboarding />

      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[1.4rem] font-extrabold tracking-tightest">
            Kumusta, {user.name.split(" ")[0]} 👋
          </h2>
          <p className="text-note text-ink-soft">
            Here&apos;s how <span className="font-semibold text-ink">{store}</span> is doing today.
          </p>
        </div>
        <Link
          href="/pos"
          className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] shadow-btn tracking-tight transition duration-150"
        >
          <Icon name="pos" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          Open register
        </Link>
      </div>

      {state.status === "loading" && <Skeleton />}
      {state.status === "error" && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && <Live pulse={state.pulse} alerts={state.alerts} />}

      {/* Modules (navigation, not data) */}
      <div>
        <h3 className="font-extrabold tracking-tight mb-3">Your tools</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((mod) => {
            const inner = (
              <>
                <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-brand-50 text-brand-600 transition duration-150 group-hover:bg-brand-500 group-hover:text-white">
                  <Icon name={mod.icon} className="w-5 h-5" strokeWidth={1.6} />
                </span>
                <div className="mt-3 font-bold tracking-tight flex items-center gap-2">
                  {mod.label}
                  {!mod.href && (
                    <span className="text-[10px] font-bold bg-paper hairline rounded-full px-2 py-0.5 text-ink-faint">
                      soon
                    </span>
                  )}
                </div>
                <div className="text-fine text-ink-soft">{mod.desc}</div>
              </>
            );
            return mod.href ? (
              <Link
                key={mod.label}
                href={mod.href}
                className="group rounded-xl2 bg-surface hairline shadow-card p-5 hover:border-brand-200 hover:shadow-soft transition duration-150"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={mod.label}
                className="group rounded-xl2 bg-surface hairline shadow-card p-5 opacity-80"
              >
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Live({ pulse, alerts }: { pulse: DashboardPulse; alerts: StockAlert[] }) {
  return (
    <>
      {alerts.length > 0 && <LowStockBanner alerts={alerts} />}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="peso" label="Sales today" value={formatCentsWhole(pulse.grossCents)} />
        <Kpi icon="receipt" label="Transactions" value={formatCount(pulse.txns)} />
        <Kpi icon="cart" label="Avg. order value" value={formatCents(pulse.aovCents)} />
        <Kpi
          icon="box"
          label="Items sold"
          value={formatCount(pulse.itemsSold)}
          warn={pulse.lowStockCount > 0}
          note={pulse.lowStockCount > 0 ? `${pulse.lowStockCount} low on stock` : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Hourly revenue velocity — the focal panel of this row, so it carries
            more lift and a firmer edge than its neighbours. */}
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline-strong shadow-soft p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">Revenue velocity</h3>
            <span className="text-fine font-semibold text-ink-faint">today, by hour</span>
          </div>
          <HourlyChart hourly={pulse.hourly} />
        </div>

        {/* Low on stock (live) */}
        <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold tracking-tight">Low on stock</h3>
            <span
              className={
                "text-cap font-bold rounded-full px-2.5 py-0.5 " +
                (alerts.length > 0 ? "text-amber-600 bg-amber-50" : "text-accent-600 bg-accent-50")
              }
            >
              {alerts.length} {alerts.length === 1 ? "item" : "items"}
            </span>
          </div>
          {alerts.length === 0 ? (
            <p className="mt-6 mb-4 text-center text-note text-ink-soft">
              Everything&apos;s well stocked. 👌
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {alerts.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-note font-semibold truncate">{s.name}</div>
                    <div className="text-fine text-ink-faint">reorder at {s.lowStockThreshold}</div>
                  </div>
                  <span
                    className={
                      "text-fine font-bold tabular-nums " +
                      (s.depleted ? "text-rose-600" : "text-amber-600")
                    }
                  >
                    {s.depleted ? "out" : `${s.stock} left`}
                  </span>
                </div>
              ))}
              {alerts.length > 5 && (
                <Link
                  href="/dashboard/inventory"
                  className="block pt-1 text-fine font-semibold text-brand-600 hover:text-brand-700"
                >
                  +{alerts.length - 5} more in inventory →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <PaymentMix byMethod={pulse.byMethod} />
        <TopSellers items={pulse.topItems} />
        <TaxCard pulse={pulse} />
      </div>
    </>
  );
}

function LowStockBanner({ alerts }: { alerts: StockAlert[] }) {
  const depleted = alerts.filter((a) => a.depleted).length;
  const names = alerts.slice(0, 3).map((a) => a.name).join(", ");
  return (
    <div className="rounded-xl2 bg-amber-50 border border-amber-200 dark:border-amber-500/30 p-4 sm:p-5 flex items-start gap-3.5">
      <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-600 shrink-0">
        <Icon name="box" className="w-[18px] h-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold tracking-tight text-amber-700 dark:text-amber-400">
          {alerts.length} {alerts.length === 1 ? "item is" : "items are"} running low
          {depleted > 0 && ` — ${depleted} fully out of stock`}
        </div>
        <p className="text-fine text-amber-700/80 dark:text-amber-400/80 truncate">{names}</p>
      </div>
      <Link
        href="/dashboard/inventory"
        className="shrink-0 inline-flex items-center gap-1.5 bg-surface hairline text-ink font-semibold text-note px-3.5 py-2 rounded-[9px] hover:border-amber-300 transition duration-150"
      >
        Restock
        <Icon name="arrow" className="w-4 h-4" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

function HourlyChart({ hourly }: { hourly: DashboardPulse["hourly"] }) {
  if (hourly.length === 0) {
    return (
      <p className="mt-10 mb-8 text-center text-note text-ink-soft">
        No sales yet today — the register opens the data flowing.
      </p>
    );
  }
  const minH = Math.min(...hourly.map((h) => h.hour));
  const maxH = Math.max(...hourly.map((h) => h.hour));
  const byHour = new Map(hourly.map((h) => [h.hour, h]));
  const span: number[] = [];
  for (let h = minH; h <= maxH; h++) span.push(h);
  const peak = Math.max(1, ...hourly.map((h) => h.grossCents));

  return (
    <div className="mt-6 flex items-end justify-between gap-2 h-[160px]">
      {span.map((h) => {
        const pt = byHour.get(h);
        const gross = pt?.grossCents ?? 0;
        return (
          <div key={h} className="group flex-1 flex flex-col items-center gap-2 min-w-0">
            <div className="w-full flex-1 flex items-end relative">
              <div
                className={
                  "w-full rounded-t-[6px] transition duration-150 " +
                  (gross > 0 ? "bg-brand-500/90 hover:bg-brand-600" : "bg-paper hairline")
                }
                style={{ height: `${gross > 0 ? Math.max(4, (gross / peak) * 100) : 3}%` }}
              />
              {gross > 0 && (
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[7px] bg-ink text-white text-cap font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition">
                  {formatCents(gross)}
                </span>
              )}
            </div>
            <span className="text-cap font-semibold text-ink-faint">{formatHour(h)}</span>
          </div>
        );
      })}
    </div>
  );
}

function PaymentMix({ byMethod }: { byMethod: DashboardPulse["byMethod"] }) {
  const total = byMethod.reduce((s, m) => s + m.grossCents, 0);
  const ewallet = byMethod
    .filter((m) => m.method !== "Cash")
    .reduce((s, m) => s + m.grossCents, 0);
  const ewalletPct = total > 0 ? Math.round((ewallet / total) * 100) : 0;

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <h3 className="font-extrabold tracking-tight">Payment mix</h3>
      {total === 0 ? (
        <p className="mt-6 mb-4 text-center text-note text-ink-soft">No settlements yet today.</p>
      ) : (
        <>
          <p className="mt-1 text-fine text-ink-soft">
            <span className="font-bold text-ink">{ewalletPct}%</span> e-wallet ·{" "}
            <span className="font-bold text-ink">{100 - ewalletPct}%</span> cash
          </p>
          {/* Stacked share bar */}
          <div className="mt-4 flex h-2.5 rounded-full overflow-hidden bg-paper hairline">
            {byMethod.map((m) => (
              <span
                key={m.method}
                className={METHOD_STYLE[m.method] ?? "bg-ink-faint"}
                style={{ width: `${(m.grossCents / total) * 100}%` }}
                title={`${m.method}: ${formatCents(m.grossCents)}`}
              />
            ))}
          </div>
          <div className="mt-4 space-y-2.5">
            {byMethod.map((m) => (
              <div key={m.method} className="flex items-center gap-2.5 text-note">
                <span className={"w-2.5 h-2.5 rounded-full " + (METHOD_STYLE[m.method] ?? "bg-ink-faint")} />
                <span className="font-semibold">{m.method}</span>
                <span className="ml-auto text-ink-soft tabular-nums">{m.txns}×</span>
                <span className="w-[80px] text-right font-bold tracking-tight tabular-nums">
                  {formatCents(m.grossCents)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TopSellers({ items }: { items: DashboardPulse["topItems"] }) {
  const peak = Math.max(1, ...items.map((i) => i.qty));
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <h3 className="font-extrabold tracking-tight">Top sellers today</h3>
      {items.length === 0 ? (
        <p className="mt-6 mb-4 text-center text-note text-ink-soft">Nothing sold yet today.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((it) => (
            <div key={it.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-note font-semibold truncate">{it.name}</span>
                <span className="text-fine font-bold tracking-tight tabular-nums shrink-0">
                  {it.qty}×
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2.5">
                <span className="flex-1 h-1.5 rounded-full bg-paper hairline overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-accent-500"
                    style={{ width: `${(it.qty / peak) * 100}%` }}
                  />
                </span>
                <span className="w-[72px] text-right text-fine text-ink-soft tabular-nums">
                  {formatCents(it.revenueCents)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaxCard({ pulse }: { pulse: DashboardPulse }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5 flex flex-col">
      <h3 className="font-extrabold tracking-tight">Today&apos;s books</h3>
      <div className="mt-4 space-y-3 flex-1">
        <Line label="Net of VAT" value={formatCents(pulse.netCents)} />
        <Line label="Output VAT (12%)" value={formatCents(pulse.vatCents)} />
        <Line label="Discounts given" value={formatCents(pulse.discountCents)} muted />
        <div className="hairline-t pt-3 flex items-center justify-between">
          <span className="text-note font-bold">Gross sales</span>
          <span className="text-[14px] font-extrabold tracking-tight tabular-nums">
            {formatCents(pulse.grossCents)}
          </span>
        </div>
      </div>
      <Link
        href="/dashboard/compliance"
        className="mt-4 inline-flex items-center justify-center gap-1.5 bg-paper hairline text-ink font-semibold text-note py-2.5 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150"
      >
        <Icon name="file" className="w-[16px] h-[16px]" strokeWidth={1.7} />
        BIR sales ledger
      </Link>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-note">
      <span className="text-ink-soft font-semibold">{label}</span>
      <span className={"font-bold tracking-tight tabular-nums " + (muted ? "text-ink-soft" : "")}>
        {value}
      </span>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  warn,
  note,
}: {
  icon: IconName;
  label: string;
  value: string;
  warn?: boolean;
  note?: string;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="flex items-center justify-between">
        <span
          className={
            "grid place-items-center w-9 h-9 rounded-[10px] " +
            (warn ? "bg-amber-50 text-amber-600" : "bg-brand-50 text-brand-600")
          }
        >
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        {note && <span className="text-fine font-bold text-amber-600">{note}</span>}
      </div>
      <div className="mt-3 text-stat font-extrabold">{value}</div>
      <div className="mt-1.5 text-fine text-ink-soft">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card h-[120px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl2 bg-surface hairline shadow-card h-[230px]" />
        <div className="rounded-xl2 bg-surface hairline shadow-card h-[230px]" />
      </div>
    </div>
  );
}

/** 0 → "12a", 9 → "9a", 13 → "1p". */
function formatHour(h: number): string {
  const period = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${period}`;
}
