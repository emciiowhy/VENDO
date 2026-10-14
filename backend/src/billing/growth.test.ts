import { describe, it, expect } from "vitest";
import { computeGrowthMetrics, type GrowthTenantRow, type TenantStatus } from "./growth.js";

// Pure reduction over the tenant register with an injected clock — no DB.

const NOW = new Date("2026-06-15T00:00:00.000Z");

/** Build a tenant row; `createdAt` defaults to this month, `trialStartsAt` present. */
function tenant(
  status: TenantStatus,
  opts: { trialled?: boolean; createdAt?: string } = {},
): GrowthTenantRow {
  return {
    status,
    trialStartsAt: opts.trialled === false ? null : new Date("2026-06-01T00:00:00.000Z"),
    createdAt: new Date(opts.createdAt ?? "2026-06-02T00:00:00.000Z"),
  };
}

describe("computeGrowthMetrics — conversion", () => {
  it("counts trials started and the share now paying", () => {
    const rows = [
      tenant("active"), // trialled → converted
      tenant("active"), // trialled → converted
      tenant("trial"), // trialled, not yet converted
      tenant("trial_expired"), // trialled, lost
      tenant("active", { trialled: false }), // operator-provisioned, excluded from conversion
    ];
    const { conversion } = computeGrowthMetrics(rows, NOW);
    expect(conversion.trialsStarted).toBe(4);
    expect(conversion.converted).toBe(2);
    expect(conversion.ratePct).toBe(50);
  });

  it("returns a null rate when no store has ever trialled", () => {
    const { conversion } = computeGrowthMetrics([tenant("active", { trialled: false })], NOW);
    expect(conversion.trialsStarted).toBe(0);
    expect(conversion.ratePct).toBeNull();
  });
});

describe("computeGrowthMetrics — churn", () => {
  it("rates churned over the active+churned base", () => {
    const rows = [
      tenant("active"),
      tenant("active"),
      tenant("active"),
      tenant("suspended"),
      tenant("trial_expired"),
      tenant("trial"), // in-flight: neither active nor churned
    ];
    const { churn } = computeGrowthMetrics(rows, NOW);
    expect(churn.activeStores).toBe(3);
    expect(churn.churnedStores).toBe(2);
    expect(churn.ratePct).toBe(40); // 2 / (3 + 2)
  });

  it("returns a null rate when there are no settled stores", () => {
    const { churn } = computeGrowthMetrics([tenant("trial")], NOW);
    expect(churn.ratePct).toBeNull();
  });
});

describe("computeGrowthMetrics — signup cohorts", () => {
  it("returns six months oldest→newest and buckets by signup month", () => {
    const rows = [
      tenant("active", { createdAt: "2026-06-02T00:00:00.000Z" }), // this month, retained
      tenant("trial", { createdAt: "2026-06-20T00:00:00.000Z" }), // this month, retained
      tenant("trial_expired", { createdAt: "2026-06-25T00:00:00.000Z" }), // this month, lost
      tenant("active", { createdAt: "2026-04-10T00:00:00.000Z" }), // two months back, retained
    ];
    const { cohorts } = computeGrowthMetrics(rows, NOW);
    expect(cohorts).toHaveLength(6);
    expect(cohorts[0].month).toBe("2026-01-01");
    expect(cohorts[5].month).toBe("2026-06-01");

    const june = cohorts[5];
    expect(june.signups).toBe(3);
    expect(june.retained).toBe(2);
    expect(june.retentionPct).toBe(67); // round(2/3*100)

    const april = cohorts.find((c) => c.month === "2026-04-01")!;
    expect(april.signups).toBe(1);
    expect(april.retentionPct).toBe(100);
  });

  it("gives an empty month a null retention rate, not NaN", () => {
    const { cohorts } = computeGrowthMetrics([], NOW);
    expect(cohorts).toHaveLength(6);
    for (const c of cohorts) {
      expect(c.signups).toBe(0);
      expect(c.retentionPct).toBeNull();
    }
  });
});
