"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../theme/ThemeProvider";
import { formatCents } from "@/lib/format";
import type { CategorySlice, TrendPoint } from "@/lib/finance";

/**
 * Recharts visualisations for the Finance console — a profit-trend composite
 * (net sales & expenses as bars, profit as a line) and an expense-mix donut.
 * Recharts paints to SVG and won't inherit our CSS-variable tokens, so every
 * colour is threaded in from the active theme (see BillingCharts for the same
 * approach), keeping the charts legible on both Light and Dark panels.
 */

/** Stable palette for expense categories (cycled). */
const CAT_COLORS = [
  "#2f5bff", // brand-600
  "#0a9968", // accent
  "#f59e0b", // amber-500
  "#ef4444", // rose-500
  "#8b5cf6", // violet-500
  "#0ea5e9", // sky-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#64748b", // slate-500
];

function usePalette() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    dark,
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(11,18,32,0.08)",
    tick: dark ? "#9aa7c0" : "#56627a",
    net: dark ? "#5e7dff" : "#2f5bff",
    spent: dark ? "#fb7185" : "#f43f5e",
    profit: dark ? "#0fb67e" : "#0a9968",
  };
}

/** ₱-compact axis tick from a centavo value (e.g. 1872400 → "₱18.7k"). */
function pesoTick(cents: number): string {
  const pesos = cents / 100;
  if (Math.abs(pesos) >= 1000) return `₱${(pesos / 1000).toFixed(Math.abs(pesos) >= 10000 ? 0 : 1)}k`;
  return `₱${Math.round(pesos)}`;
}

interface TipRow {
  label: string;
  value: string;
  color?: string;
}
function TooltipCard({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-[10px] bg-surface hairline shadow-soft px-3 py-2 text-[12.5px]">
      <div className="font-bold tracking-tight mb-0.5">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="w-2 h-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-bold text-ink tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Profit trend (net sales & expenses bars + profit line) ───────────────────

export function ProfitTrendChart({ points }: { points: TrendPoint[] }) {
  const p = usePalette();
  const hasData = points.some((d) => d.netCents > 0 || d.spentCents > 0);
  if (!hasData) {
    return (
      <p className="py-16 text-center text-[13.5px] text-ink-soft">
        No revenue or expenses recorded yet — your monthly profit trend appears here once the
        register starts ringing and you log a cost or two.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={p.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: p.tick, fontSize: 12 }} tickLine={false} axisLine={{ stroke: p.grid }} />
        <YAxis
          tick={{ fill: p.tick, fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => pesoTick(v)}
        />
        <Tooltip
          cursor={{ fill: p.grid }}
          content={({ active, payload }: any) =>
            active && payload?.length ? (
              <TooltipCard
                title={payload[0].payload.label}
                rows={[
                  { label: "Net sales", value: formatCents(payload[0].payload.netCents), color: p.net },
                  { label: "Expenses", value: formatCents(payload[0].payload.spentCents), color: p.spent },
                  { label: "Profit", value: formatCents(payload[0].payload.profitCents), color: p.profit },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="netCents" fill={p.net} radius={[5, 5, 0, 0]} maxBarSize={26} />
        <Bar dataKey="spentCents" fill={p.spent} radius={[5, 5, 0, 0]} maxBarSize={26} />
        <Line
          type="monotone"
          dataKey="profitCents"
          stroke={p.profit}
          strokeWidth={2.5}
          dot={{ r: 3, fill: p.profit, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Expense mix (donut) ──────────────────────────────────────────────────────

export function ExpenseMixChart({ slices }: { slices: CategorySlice[] }) {
  const data = slices.filter((s) => s.totalCents > 0);
  const total = data.reduce((s, b) => s + b.totalCents, 0);

  if (total === 0) {
    return (
      <p className="py-14 text-center text-[13px] text-ink-soft">
        No expenses logged this month yet.
      </p>
    );
  }

  const colorOf = (i: number) => CAT_COLORS[i % CAT_COLORS.length];

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie
            data={data}
            dataKey="totalCents"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((b, i) => (
              <Cell key={b.category} fill={colorOf(i)} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipCard
                  title={payload[0].payload.category}
                  rows={[
                    { label: "Spent", value: formatCents(payload[0].payload.totalCents) },
                    {
                      label: "Share",
                      value: `${Math.round((payload[0].payload.totalCents / total) * 100)}%`,
                    },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((b, i) => (
          <span key={b.category} className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(i) }} />
            <span className="font-semibold">{b.category}</span>
            <span className="text-ink-faint tabular-nums">{Math.round((b.totalCents / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
