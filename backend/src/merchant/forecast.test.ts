import { describe, it, expect } from "vitest";
import {
  DEFAULT_FORECAST_OPTIONS,
  buildForecast,
  type ForecastOptions,
  type ProductSalesRow,
} from "./forecast.js";

// Pure reorder-forecast maths — no database. The repository feeds these same
// shapes from the live sales ledger.

const OPTS: ForecastOptions = { windowDays: 30, coverDays: 14, horizonDays: 21 };
const AT = new Date("2026-06-15T00:00:00.000Z");

function row(p: Partial<ProductSalesRow> & { id: string }): ProductSalesRow {
  return {
    name: `Product ${p.id}`,
    sku: null,
    stock: 0,
    lowStockThreshold: 0,
    unitsSold: 0,
    ...p,
  };
}

function forecast(rows: ProductSalesRow[], opts: ForecastOptions = OPTS) {
  return buildForecast(rows, opts, AT);
}

describe("buildForecast — velocity & projection", () => {
  it("derives daily velocity from units sold over the window", () => {
    // 60 units / 30 days = 2/day → 10 on hand depletes in 5 days.
    const f = forecast([row({ id: "A", stock: 10, lowStockThreshold: 5, unitsSold: 60 })]);
    expect(f.items).toHaveLength(1);
    expect(f.items[0].dailyVelocity).toBe(2);
    expect(f.items[0].daysToStockout).toBe(5);
  });

  it("rounds a fractional velocity to two decimals", () => {
    // 45 / 30 = 1.5/day → floor(9 / 1.5) = 6 days.
    const f = forecast([row({ id: "A", stock: 9, lowStockThreshold: 4, unitsSold: 45 })]);
    expect(f.items[0].dailyVelocity).toBe(1.5);
    expect(f.items[0].daysToStockout).toBe(6);
  });

  it("suggests enough to cover coverDays of demand, less on-hand", () => {
    // velocity 2/day, cover 14 days → target 28, minus 10 on hand = 18.
    const f = forecast([row({ id: "A", stock: 10, lowStockThreshold: 5, unitsSold: 60 })]);
    expect(f.items[0].suggestedOrderQty).toBe(18);
  });
});

describe("buildForecast — what gets flagged", () => {
  it("excludes a well-stocked, steady seller (not projected to run out)", () => {
    // velocity 1/day, 100 on hand → 100 days out, above threshold → no action.
    const f = forecast([row({ id: "C", stock: 100, lowStockThreshold: 5, unitsSold: 30 })]);
    expect(f.items).toHaveLength(0);
  });

  it("flags a non-selling item that has fallen to its low-stock floor", () => {
    // No sales (velocity 0) but stock 2 ≤ threshold 5 → refill to the floor.
    const f = forecast([row({ id: "D", stock: 2, lowStockThreshold: 5, unitsSold: 0 })]);
    expect(f.items).toHaveLength(1);
    expect(f.items[0].daysToStockout).toBeNull();
    expect(f.items[0].suggestedOrderQty).toBe(3); // 5 − 2
    expect(f.items[0].urgency).toBe("low");
  });

  it("drops an at-risk item once there's nothing left to order", () => {
    // At the floor exactly, not selling → suggested 0 → not actionable.
    const f = forecast([row({ id: "G", stock: 5, lowStockThreshold: 5, unitsSold: 0 })]);
    expect(f.items).toHaveLength(0);
  });
});

describe("buildForecast — urgency tiers", () => {
  it("marks a fully depleted, still-selling item as out", () => {
    const f = forecast([row({ id: "B", stock: 0, lowStockThreshold: 3, unitsSold: 30 })]);
    expect(f.items[0].urgency).toBe("out");
    expect(f.items[0].daysToStockout).toBe(0);
  });

  it("marks ≤3 days of cover as critical and mid-horizon as soon", () => {
    const critical = forecast([row({ id: "E", stock: 6, unitsSold: 90 })]); // 3/day → 2 days
    expect(critical.items[0].urgency).toBe("critical");
    const soon = forecast([row({ id: "A", stock: 10, lowStockThreshold: 5, unitsSold: 60 })]); // 5 days
    expect(soon.items[0].urgency).toBe("soon");
  });
});

describe("buildForecast — ordering & summary", () => {
  it("orders most-urgent first and totals the forecast", () => {
    const f = forecast([
      row({ id: "A", stock: 10, lowStockThreshold: 5, unitsSold: 60 }), // soon (5d), order 18
      row({ id: "B", stock: 0, lowStockThreshold: 3, unitsSold: 30 }), // out (0d),  order 14
      row({ id: "C", stock: 100, lowStockThreshold: 5, unitsSold: 30 }), // excluded
      row({ id: "D", stock: 2, lowStockThreshold: 5, unitsSold: 0 }), // low,       order 3
      row({ id: "E", stock: 6, lowStockThreshold: 0, unitsSold: 90 }), // critical,  order 36
    ]);

    expect(f.items.map((i) => i.productId)).toEqual(["B", "E", "A", "D"]);
    expect(f.summary).toEqual({ atRisk: 4, outOfStock: 1, suggestedUnitsTotal: 71 });
    expect(f.generatedAt).toBe(AT.toISOString());
    expect(f.windowDays).toBe(30);
  });
});

describe("buildForecast — option handling", () => {
  it("scales velocity by the configured window length", () => {
    // 20 units over a 10-day window = 2/day (not 20/30).
    const f = forecast([row({ id: "A", stock: 8, lowStockThreshold: 2, unitsSold: 20 })], {
      ...OPTS,
      windowDays: 10,
    });
    expect(f.items[0].dailyVelocity).toBe(2);
    expect(f.items[0].daysToStockout).toBe(4);
  });

  it("guards against a zero window (never divides by zero)", () => {
    const f = buildForecast(
      [row({ id: "A", stock: 5, lowStockThreshold: 2, unitsSold: 30 })],
      { ...OPTS, windowDays: 0 },
      AT,
    );
    // Clamped to a 1-day window → 30/day, depletes immediately.
    expect(Number.isFinite(f.items[0].dailyVelocity)).toBe(true);
    expect(f.items[0].dailyVelocity).toBe(30);
  });

  it("exposes sane defaults", () => {
    expect(DEFAULT_FORECAST_OPTIONS).toEqual({ windowDays: 30, coverDays: 14, horizonDays: 21 });
  });
});
