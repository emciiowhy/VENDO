import { Icon } from "../Icon";
import { formatCount, formatPeso } from "@/lib/format";
import { PLAN_LABEL, PLATFORM_METRICS, type Plan } from "./tenants.data";

/**
 * Module 1 — Global Metrics Summary. Not a flat grid of equal tiles: MRR is the
 * one figure a platform admin came to read, so it leads as the feature card,
 * Active Merchants sits beside it as the secondary hero, and live infrastructure
 * load runs underneath as a thin telemetry strip — big → big → dense, so the eye
 * has somewhere to land. Green carries money + health; blue carries the platform
 * and its infra.
 */
export function MetricsBento() {
  const m = PLATFORM_METRICS;
  const planOrder: Plan[] = ["enterprise", "business", "starter"];
  const mrrMax = Math.max(...planOrder.map((p) => m.mrrByPlan[p]));

  return (
    <div className="space-y-5">
      {/* Focal row: MRR feature (2/3) + Active Merchants (1/3) */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* MRR — the dominant figure on the screen */}
        <section className="md:col-span-2 rounded-xl2 bg-surface hairline-strong shadow-soft p-6">
          <CardHead icon="peso" label="Monthly Recurring Revenue" tone="money" />
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-feature font-extrabold tabular-nums">{formatPeso(m.mrrTotal)}</span>
            <span className="text-fine font-semibold text-ink-faint pb-1.5">/mo</span>
            <Delta value={m.mrrDeltaPct} className="pb-2" />
          </div>
          <div className="mt-5 space-y-2.5">
            {planOrder.map((p) => (
              <div key={p} className="flex items-center gap-3">
                <span className="w-[76px] text-fine font-semibold text-ink-soft">{PLAN_LABEL[p]}</span>
                <span className="flex-1 h-2 rounded-full bg-paper hairline overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-accent-500"
                    style={{ width: `${Math.round((m.mrrByPlan[p] / mrrMax) * 100)}%` }}
                  />
                </span>
                <span className="w-[92px] text-right text-note font-bold tracking-tight tabular-nums">
                  {formatPeso(m.mrrByPlan[p])}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Active merchants — secondary hero, given room to breathe */}
        <section className="rounded-xl2 bg-surface hairline shadow-card p-6 flex flex-col">
          <CardHead icon="store" label="Active Merchants" tone="brand" />
          <div className="mt-3 flex items-end gap-2.5">
            <span className="text-hero font-extrabold tabular-nums">{formatCount(m.activeMerchants)}</span>
            <Delta value={m.activeMerchantsDeltaPct} className="pb-1" />
          </div>
          <p className="mt-2 text-fine text-ink-soft">Live storefronts nationwide</p>
          <p className="mt-auto pt-4 text-fine text-ink-faint">
            Onboarding {m.activeMerchantsDeltaPct >= 0 ? "up" : "down"} {Math.abs(m.activeMerchantsDeltaPct)}% this month
          </p>
        </section>
      </div>

      {/* Telemetry strip: dense horizontal band, deliberately flat against the
          cards above so the rhythm shifts from "read" to "scan". */}
      <section className="rounded-xl2 bg-surface hairline p-1.5">
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[rgba(11,18,32,0.07)] dark:divide-[rgba(255,255,255,0.09)]">
          <Telemetry
            icon="activity"
            label="Uptime"
            tone="ok"
            value={
              <span className="inline-flex items-center gap-1.5 text-accent-600">
                <span className="w-2 h-2 rounded-full bg-accent-500 animate-pulse" />
                {m.uptimePct}%
              </span>
            }
          />
          <Telemetry
            icon="database"
            label="NeonDB pool"
            value={
              <span className="w-full max-w-[180px]">
                <span className="flex items-center justify-between">
                  <span className="font-bold tabular-nums">
                    {m.dbPoolUsed}
                    <span className="text-ink-faint font-semibold">/{m.dbPoolMax}</span>
                  </span>
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-paper hairline overflow-hidden">
                  <span
                    className={
                      "block h-full rounded-full " +
                      ((m.dbPoolUsed / m.dbPoolMax) * 100 >= 80 ? "bg-rose-500" : "bg-brand-500")
                    }
                    style={{ width: `${(m.dbPoolUsed / m.dbPoolMax) * 100}%` }}
                  />
                </span>
              </span>
            }
          />
          <Telemetry
            icon="bolt"
            label="Webhooks"
            value={
              <span className="font-bold tabular-nums">
                {m.webhooksPerMin}
                <span className="text-ink-faint font-semibold">/min</span>
              </span>
            }
          />
        </div>
      </section>
    </div>
  );
}

const TONE: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600",
  money: "bg-accent-50 text-accent-600",
  ok: "bg-accent-50 text-accent-600",
};

function CardHead({
  icon,
  label,
  tone = "brand",
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={"grid place-items-center w-8 h-8 rounded-[10px] " + TONE[tone]}>
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <span className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</span>
    </div>
  );
}

function Telemetry({
  icon,
  label,
  value,
  tone,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: React.ReactNode;
  tone?: "ok";
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span
        className={
          "grid place-items-center w-9 h-9 rounded-[10px] shrink-0 " +
          (tone === "ok" ? "bg-accent-50 text-accent-600" : "bg-brand-50 text-brand-600")
        }
      >
        <Icon name={icon} className="w-[18px] h-[18px]" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</div>
        <div className="mt-0.5 text-note">{value}</div>
      </div>
    </div>
  );
}

function Delta({ value, className = "" }: { value: number; className?: string }) {
  const up = value >= 0;
  return (
    <span
      className={
        "inline-flex items-center gap-0.5 text-fine font-bold " +
        (up ? "text-accent-600" : "text-rose-600") +
        " " +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {Math.abs(value)}%
    </span>
  );
}
