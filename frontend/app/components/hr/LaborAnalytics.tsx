"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useToast } from "../Toast";
import { formatCents, formatCentsWhole } from "@/lib/format";
import { getLaborAnalytics, type LaborAnalytics as Analytics } from "@/lib/hr";
import { formatMinutes } from "@/lib/timecard";

/**
 * Labor analytics for the owner: who's on the floor right now, how worked hours
 * stack up against the sales they produced, and a per-cashier efficiency matrix
 * with an exportable payroll log. Hours come from the shift-clock engine
 * (real clock-in/out punches), so this is the truthful labor read the older
 * attendance-derived Performance tab couldn't give. Tenant-scoped server-side.
 *
 * Hydration discipline: the live "active staff" durations seed `nowMs` to null
 * and only tick inside a post-mount effect.
 */
type Period = "today" | "7d" | "30d" | "month";

function rangeFor(period: Period): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  if (period === "today") return { from: iso(now), to: iso(now) };
  if (period === "7d") return { from: iso(new Date(Date.now() - 6 * 86_400_000)), to: iso(now) };
  if (period === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  return { from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(now) };
}

const PERIOD_LABEL: Record<Period, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

type SortKey = "revenuePerHourCents" | "revenueCents" | "laborHours" | "orders" | "minutesPerOrder";

const SORT_LABEL: Record<SortKey, string> = {
  revenuePerHourCents: "Revenue / hour",
  revenueCents: "Revenue",
  laborHours: "Hours worked",
  orders: "Orders",
  minutesPerOrder: "Min / order",
};

type Loaded = { key: string; analytics: Analytics } | { key: string; error: string };

export function LaborAnalytics() {
  const { push } = useToast();
  const [period, setPeriod] = useState<Period>("7d");
  const [rateInput, setRateInput] = useState("110"); // pesos / hour baseline
  const [rateCents, setRateCents] = useState(11_000);
  const [sort, setSort] = useState<SortKey>("revenuePerHourCents");
  const [result, setResult] = useState<Loaded | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);

  // A stable request key so the sentinel "is this result for what I asked?" check
  // covers both the period AND the rate (changing the rate re-derives pay).
  const key = `${period}:${rateCents}`;

  useEffect(() => {
    let alive = true;
    const { from, to } = rangeFor(period);
    void (async () => {
      const res = await getLaborAnalytics(from, to, rateCents);
      if (!alive) return;
      if (res.ok) setResult({ key, analytics: res.analytics });
      else setResult({ key, error: res.error ?? "Could not load labor analytics." });
    })();
    return () => {
      alive = false;
    };
  }, [period, rateCents, key]);

  const ready = result && "analytics" in result && result.key === key ? result.analytics : null;
  const loading = !result || result.key !== key;
  const error = result && "error" in result && result.key === key ? result.error : null;

  // Tick once per second only while someone is actually on the clock. Updates
  // come from timer callbacks only (never a synchronous setState in the effect
  // body), so `nowMs` stays null through hydration — no mismatch, lint-clean.
  const hasActive = (ready?.activeStaff.length ?? 0) > 0;
  useEffect(() => {
    if (!hasActive) return;
    const seed = window.setTimeout(() => setNowMs(Date.now()), 0);
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(seed);
      window.clearInterval(id);
    };
  }, [hasActive]);

  function commitRate() {
    const pesos = Number(rateInput.replace(/[₱,\s]/g, ""));
    const cents = Number.isFinite(pesos) && pesos >= 0 ? Math.round(pesos * 100) : 0;
    setRateInput(String(cents / 100));
    setRateCents(cents);
  }

  function exportPayrollLog() {
    if (!ready) return;
    const rows = [...ready.cashiers].sort((a, b) => b.payCents - a.payCents);
    const header = ["Cashier", "Hours worked", "Hourly rate (PHP)", "Gross pay (PHP)"];
    const body = rows.map((r) => [
      r.name,
      r.laborHours.toFixed(2),
      (ready.hourlyRateCents / 100).toFixed(2),
      (r.payCents / 100).toFixed(2),
    ]);
    const totalPay = rows.reduce((s, r) => s + r.payCents, 0);
    body.push(["TOTAL", ready.laborHours.toFixed(2), "", (totalPay / 100).toFixed(2)]);
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...body].map((line) => line.map((c) => esc(String(c))).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-log_${ready.from}_to_${ready.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push({ variant: "success", title: "Payroll log exported", message: `${rows.length} cashier(s) · ${ready.from} – ${ready.to}` });
  }

  const sortedCashiers = ready ? [...ready.cashiers].sort((a, b) => (b[sort] as number) - (a[sort] as number)) : [];

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={
                "text-[13px] font-semibold px-3 py-1.5 rounded-[9px] transition duration-150 " +
                (period === p ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-paper")
              }
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
          Hourly baseline
          <span className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint text-[13px]">₱</span>
            <input
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value.replace(/[^\d.]/g, ""))}
              onBlur={commitRate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRate();
                }
              }}
              inputMode="decimal"
              className="field-input rounded-[9px] pl-6 pr-2.5 py-1.5 text-[13px] w-[88px] text-right tabular-nums"
            />
          </span>
          / hr
        </label>
      </div>

      {loading && <div className="rounded-xl2 bg-surface hairline shadow-card h-[420px] animate-pulse" />}
      {!loading && error && (
        <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
          <p className="text-[14px] font-semibold text-rose-600">{error}</p>
        </div>
      )}

      {!loading && !error && ready && (
        <>
          {/* Labor-to-sales metric cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric icon="clock" label="Labor hours" value={`${ready.laborHours}h`} sub={`${ready.cashiers.length} on payroll`} />
            <Metric icon="peso" label="Gross sales" value={formatCentsWhole(ready.grossSalesCents)} sub="in this window" />
            <Metric
              icon="chart"
              label="Sales / labor hr"
              value={ready.laborHours > 0 ? formatCentsWhole(ready.salesPerLaborHourCents) : "—"}
              sub="revenue per worked hour"
              tone="good"
            />
            <Metric
              icon="trend"
              label="Labor cost"
              value={formatCentsWhole(ready.laborCostCents)}
              sub={`${ready.laborCostPct}% of gross sales`}
              tone={ready.laborCostPct > 0 && ready.laborCostPct <= 30 ? "good" : ready.laborCostPct > 45 ? "bad" : undefined}
            />
          </div>

          {/* Active staff — real-time floor tracker */}
          <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 hairline-b">
              <h3 className="font-extrabold tracking-tight flex items-center gap-2">
                <Icon name="users" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
                On the floor now
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-accent-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-60 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-500" />
                </span>
                {ready.activeStaff.length} clocked in
              </span>
            </div>
            {ready.activeStaff.length === 0 ? (
              <p className="px-5 py-8 text-center text-[13px] text-ink-soft">No one is on the clock right now.</p>
            ) : (
              <div className="divide-y divide-ink/5">
                {ready.activeStaff.map((s) => {
                  const mins = nowMs !== null ? (nowMs - Date.parse(s.clockIn)) / 60_000 : s.elapsedMinutes;
                  return (
                    <div key={s.userId} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-500 text-white font-bold text-[13px]">
                          {(s.name[0] ?? "?").toUpperCase()}
                        </span>
                        <div className="leading-tight">
                          <div className="font-semibold text-[14px]">{s.name}</div>
                          <div className="text-[11.5px] text-ink-faint">
                            since {new Date(s.clockIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                      <span className="text-[15px] font-extrabold tabular-nums text-accent-600">{formatMinutes(mins)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cashier efficiency matrix */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-extrabold tracking-tight">Cashier efficiency</h3>
              <div className="flex items-center gap-2.5">
                <label className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
                  Sort by
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="field-input rounded-[9px] px-2.5 py-1.5 text-[13px]"
                  >
                    {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={exportPayrollLog}
                  disabled={ready.cashiers.length === 0}
                  className="inline-flex items-center gap-2 bg-paper hairline text-ink font-semibold text-[13px] px-3.5 py-2 rounded-[10px] hover:border-brand-200 hover:text-brand-600 transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon name="download" className="w-[16px] h-[16px]" strokeWidth={1.8} />
                  Export payroll log
                </button>
              </div>
            </div>

            <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] font-semibold text-ink-faint border-b border-ink/8 bg-paper/40">
                      <th className="px-5 py-2.5">Cashier</th>
                      <th className="px-3 py-2.5 text-right">Hours</th>
                      <th className="px-3 py-2.5 text-center">Orders</th>
                      <th className="px-3 py-2.5 text-right">Revenue</th>
                      <th className="px-3 py-2.5 text-right">Rev / hr</th>
                      <th className="px-3 py-2.5 text-right">Avg basket</th>
                      <th className="px-3 py-2.5 text-right">Min / order</th>
                      <th className="px-5 py-2.5 text-right">Est. pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCashiers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-12 text-center text-[13px] text-ink-soft">
                          No clocked hours or sales in this window yet.
                        </td>
                      </tr>
                    )}
                    {sortedCashiers.map((r) => (
                      <tr key={r.userId} className="border-b border-ink/5 last:border-0 hover:bg-paper/40 transition">
                        <td className="px-5 py-3 font-semibold">{r.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{r.laborHours}h</td>
                        <td className="px-3 py-3 text-center tabular-nums">{r.orders || <span className="text-ink-faint">—</span>}</td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold">
                          {r.orders > 0 ? formatCentsWhole(r.revenueCents) : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {r.laborHours > 0 && r.orders > 0 ? formatCentsWhole(r.revenuePerHourCents) : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {r.orders > 0 ? formatCents(r.avgOrderCents) : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {r.orders > 0 ? `${r.minutesPerOrder}m` : <span className="text-ink-faint">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums whitespace-nowrap font-bold">{formatCents(r.payCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <p className="text-[11.5px] text-ink-faint flex items-start gap-1.5 max-w-[72ch]">
            <Icon name="shield" className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.7} />
            Hours come from real shift-clock punches. “Est. pay” is worked hours × the hourly baseline above — a gross
            estimate for the payroll log, not statutory net. “Min / order” is clocked labor minutes per transaction (a
            throughput read; lower is brisker).
          </p>
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const accent = tone === "good" ? "bg-accent-50 text-accent-600" : tone === "bad" ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600";
  return (
    <div className="group rounded-xl2 bg-surface hairline shadow-card p-5 transition duration-200 hover:hairline-strong hover:shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-cap font-semibold uppercase tracking-wider text-ink-faint">{label}</span>
        <span className={"grid place-items-center w-8 h-8 rounded-[10px] transition-colors " + accent}>
          <Icon name={icon} className="w-[17px] h-[17px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-3.5 text-stat font-extrabold tracking-tightest tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-1 text-[11.5px] text-ink-faint">{sub}</div>}
    </div>
  );
}
