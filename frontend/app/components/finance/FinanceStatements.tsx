"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "../Icon";
import { formatCents } from "@/lib/format";
import {
  getBalanceSheet,
  getCashFlow,
  type BalanceSheet,
  type CashFlow,
  type StatementLine,
} from "@/lib/finance";

/**
 * The two derived financial statements that sit beside the P&L on the Finance
 * page: a snapshot Balance Sheet and a single-month Cash Flow. Both are read-only
 * and self-fetching; setState only ever runs after `await` inside the effect (an
 * `alive` guard covers unmount), so the set-state-in-effect rule holds.
 *
 * Money arrives as integer centavos. The figures are derived from the same
 * ledgers as the P&L — see backend finance.reports.ts for the cash definition.
 */

// ── Balance sheet ────────────────────────────────────────────────────────────

export function BalanceSheetView() {
  const [sheet, setSheet] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getBalanceSheet();
      if (!alive) return;
      if (res.ok) {
        setSheet(res.balanceSheet);
        setError(null);
      } else {
        setError(res.error ?? "Could not compile the balance sheet.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <StatementSkeleton />;
  if (error) return <StatementError message={error} />;
  if (!sheet) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Balance sheet</h2>
        <p className="text-[13.5px] text-ink-soft">
          Your store&apos;s financial position as of {formatStatementDate(sheet.asOf)}.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon="wallet" title="Assets" total={sheet.assets.totalCents} items={sheet.assets.items} tone="good" />
        <div className="space-y-5">
          <Section
            icon="receipt"
            title="Liabilities"
            total={sheet.liabilities.totalCents}
            items={sheet.liabilities.items}
            tone="bad"
          />
          <Section
            icon="trend"
            title="Owner's equity"
            total={sheet.equity.totalCents}
            items={sheet.equity.items}
            tone="brand"
          />
        </div>
      </div>

      <p className="text-[12px] text-ink-faint">
        Inventory is valued at each item&apos;s latest purchase cost × on-hand. Cash is derived
        from collections less expenses and goods received; owner&apos;s equity is the residual, so
        assets always equal liabilities plus equity.
      </p>
    </div>
  );
}

function Section({
  icon,
  title,
  total,
  items,
  tone,
}: {
  icon: IconName;
  title: string;
  total: number;
  items: StatementLine[];
  tone: "good" | "bad" | "brand";
}) {
  const toneCls =
    tone === "good"
      ? "bg-accent-50 text-accent-600"
      : tone === "bad"
        ? "bg-rose-50 text-rose-600"
        : "bg-brand-50 text-brand-600";
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 hairline-b">
        <span className={"grid place-items-center w-9 h-9 rounded-[10px] " + toneCls}>
          <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
        </span>
        <h3 className="font-extrabold tracking-tight">{title}</h3>
      </div>
      <ul>
        {items.map((it) => (
          <li
            key={it.label}
            className="flex items-center justify-between px-5 py-3 text-[13.5px] hairline-b last:border-0"
          >
            <span className="text-ink-soft">{it.label}</span>
            <span className="font-semibold tabular-nums">{formatCents(it.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-5 py-3.5 bg-paper/60">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">
          Total {title.toLowerCase()}
        </span>
        <span className="font-extrabold tracking-tight tabular-nums">{formatCents(total)}</span>
      </div>
    </div>
  );
}

// ── Cash flow ────────────────────────────────────────────────────────────────

export function CashFlowView() {
  const [month, setMonth] = useState<string>(() => currentMonth());
  const [flow, setFlow] = useState<CashFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getCashFlow(month);
      if (!alive) return;
      if (res.ok) {
        setFlow(res.cashFlow);
        setError(null);
      } else {
        setError(res.error ?? "Could not compile the cash-flow statement.");
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [month]);

  const atCurrent = month >= currentMonth();
  function step(delta: number) {
    const next = addMonths(month, delta);
    if (next > currentMonth()) return;
    setMonth(next);
    setLoading(true);
    setError(null);
  }

  const positive = (flow?.netChangeCents ?? 0) >= 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[1.3rem] font-extrabold tracking-tightest">Cash flow</h2>
          <p className="text-[13.5px] text-ink-soft">
            Cash in and out of the business for the month.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft hover:text-ink hover:border-brand-200 transition duration-150"
          >
            <Icon name="chevron" className="w-[18px] h-[18px] rotate-90" strokeWidth={1.8} />
          </button>
          <div className="min-w-[140px] text-center">
            <div className="text-[14px] font-extrabold tracking-tight">
              {flow?.monthLabel ?? monthLabel(month)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atCurrent}
            aria-label="Next month"
            className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft hover:text-ink hover:border-brand-200 transition duration-150 disabled:opacity-40"
          >
            <Icon name="chevron" className="w-[18px] h-[18px] -rotate-90" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {loading ? (
        <StatementSkeleton />
      ) : error ? (
        <StatementError message={error} />
      ) : flow ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <FlowKpi label="Opening cash" value={formatCents(flow.openingCashCents)} />
            <FlowKpi
              label="Net change"
              value={(positive ? "+" : "−") + formatCents(Math.abs(flow.netChangeCents))}
              tone={positive ? "good" : "bad"}
            />
            <FlowKpi label="Closing cash" value={formatCents(flow.closingCashCents)} strong />
          </div>

          <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
            <FlowGroup title="Cash in" lines={flow.inflows} sign="+" tone="good" />
            <FlowGroup title="Cash out" lines={flow.outflows} sign="−" tone="bad" />
            <div className="flex items-center justify-between px-5 py-3.5 bg-paper/60">
              <span className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">
                Net cash flow
              </span>
              <span
                className={
                  "font-extrabold tracking-tight tabular-nums " +
                  (positive ? "text-accent-600" : "text-rose-600")
                }
              >
                {(positive ? "+" : "−") + formatCents(Math.abs(flow.netChangeCents))}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function FlowGroup({
  title,
  lines,
  sign,
  tone,
}: {
  title: string;
  lines: StatementLine[];
  sign: "+" | "−";
  tone: "good" | "bad";
}) {
  return (
    <div className="hairline-b">
      <div className="px-5 pt-4 pb-1 text-[12px] font-bold uppercase tracking-wide text-ink-faint">
        {title}
      </div>
      <ul>
        {lines.map((l) => (
          <li key={l.label} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]">
            <span className="text-ink-soft">{l.label}</span>
            <span className={"font-semibold tabular-nums " + (tone === "good" ? "text-accent-600" : "text-rose-600")}>
              {sign}
              {formatCents(l.amountCents)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowKpi({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-5">
      <div className="text-[12.5px] text-ink-soft">{label}</div>
      <div
        className={
          "mt-2 text-[1.45rem] leading-none font-extrabold tracking-tightest tabular-nums " +
          (tone === "good" ? "text-accent-600" : tone === "bad" ? "text-rose-600" : strong ? "" : "text-ink")
        }
      >
        {value}
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function StatementSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2 animate-pulse">
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[260px]" />
      <div className="rounded-xl2 bg-surface hairline shadow-card h-[260px]" />
    </div>
  );
}

function StatementError({ message }: { message: string }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-8 text-center">
      <p className="text-[14px] font-semibold text-rose-600">{message}</p>
    </div>
  );
}

function formatStatementDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}
