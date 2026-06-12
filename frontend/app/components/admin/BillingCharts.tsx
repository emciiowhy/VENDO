"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../theme/ThemeProvider";
import { formatCents, formatCentsWhole } from "@/lib/format";
import type { FeeTrendPoint, MrrTrendPoint, PlanBreakdownRow } from "@/lib/adminAnalytics";

/**
 * Recharts visualizations for the Billing console. Every vector, gridline, axis
 * tick and tooltip resolves its colour from the active theme (via useTheme), so
 * the charts read cleanly on both the light `bg-surface` panels and their dark
 * retint — Recharts paints to SVG and won't inherit our CSS-variable tokens, so
 * the palette is threaded in explicitly.
 */

const PLAN_COLORS: Record<string, string> = {
  starter: "#5e7dff", // brand-400
  business: "#1f49e6", // brand-600
  enterprise: "#0fb67e", // accent-500
};

function usePalette() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    dark,
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(11,18,32,0.08)",
    tick: dark ? "#9aa7c0" : "#56627a",
    brand: dark ? "#5e7dff" : "#2f5bff",
    accent: dark ? "#0fb67e" : "#0a9968",
  };
}

/** Short month label from a YYYY-MM-01 key. */
function monthShort(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "short" });
}

/** ₱-compact axis tick from a centavo value (e.g. 1872400 → "₱18.7k"). */
function pesoTick(cents: number): string {
  const pesos = cents / 100;
  if (pesos >= 1000) return `₱${(pesos / 1000).toFixed(pesos >= 10000 ? 0 : 1)}k`;
  return `₱${Math.round(pesos)}`;
}

interface TipRow {
  label: string;
  value: string;
}
/** Themed tooltip card (uses our tokens so it adapts across Light/Dark). */
function TooltipCard({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-[10px] bg-surface hairline shadow-soft px-3 py-2 text-[12.5px]">
      <div className="font-bold tracking-tight mb-0.5">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-ink-soft">
          <span>{r.label}</span>
          <span className="font-bold text-ink tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── MRR timeline (line) ─────────────────────────────────────────────────────

export function MrrTrendChart({ points }: { points: MrrTrendPoint[] }) {
  const p = usePalette();
  const data = points.map((d) => ({ ...d, label: monthShort(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
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
          cursor={{ stroke: p.grid }}
          content={({ active, payload }: any) =>
            active && payload?.length ? (
              <TooltipCard
                title={payload[0].payload.label}
                rows={[
                  { label: "MRR", value: formatCentsWhole(payload[0].payload.mrrCents) },
                  { label: "Stores", value: String(payload[0].payload.stores) },
                ]}
              />
            ) : null
          }
        />
        <Line
          type="monotone"
          dataKey="mrrCents"
          stroke={p.brand}
          strokeWidth={2.5}
          dot={{ r: 3, fill: p.brand, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Plan distribution (donut) ───────────────────────────────────────────────

export function PlanDistributionChart({ byPlan }: { byPlan: PlanBreakdownRow[] }) {
  const data = byPlan.filter((b) => b.stores > 0);
  const total = data.reduce((s, b) => s + b.stores, 0);

  if (total === 0) {
    return (
      <p className="py-16 text-center text-[13.5px] text-ink-soft">No active subscribers yet.</p>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie
            data={data}
            dataKey="stores"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((b) => (
              <Cell key={b.plan} fill={PLAN_COLORS[b.plan] ?? "#5e7dff"} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <TooltipCard
                  title={payload[0].payload.label}
                  rows={[
                    { label: "Stores", value: String(payload[0].payload.stores) },
                    { label: "MRR", value: formatCentsWhole(payload[0].payload.mrrCents) },
                  ]}
                />
              ) : null
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((b) => (
          <span key={b.plan} className="inline-flex items-center gap-1.5 text-[12.5px]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLAN_COLORS[b.plan] }} />
            <span className="font-semibold">{b.label}</span>
            <span className="text-ink-faint tabular-nums">{b.stores}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Transaction-fee revenue (bar) ───────────────────────────────────────────

export function FeeTrendChart({ points, feeRatePct }: { points: FeeTrendPoint[]; feeRatePct: number }) {
  const p = usePalette();
  if (points.length === 0) {
    return (
      <p className="py-16 text-center text-[13.5px] text-ink-soft">
        No settled transactions yet — fee revenue appears here once stores start selling.
      </p>
    );
  }
  const data = points.map((d) => ({ ...d, label: monthShort(d.month) }));

  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
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
                title={`${payload[0].payload.label} · ${feeRatePct}% of GMV`}
                rows={[
                  { label: "Fee revenue", value: formatCents(payload[0].payload.feeCents) },
                  { label: "GMV", value: formatCentsWhole(payload[0].payload.gmvCents) },
                  { label: "Txns", value: String(payload[0].payload.txns) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="feeCents" fill={p.accent} radius={[6, 6, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
