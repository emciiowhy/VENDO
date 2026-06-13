import { describe, it, expect } from "vitest";
import { moveStock } from "./stockLedger.js";

/**
 * These exercise the ledger's decision logic — balance math, the never-go-
 * negative guard, the zero-delta no-op and the journal write — against a stub
 * client, so they run without a live Postgres (matching the rest of the suite).
 * The stub answers the locking SELECT with a configured on-hand and records
 * every statement so we can assert what the helper did.
 */
interface Call {
  sql: string;
  params: unknown[];
}

function stubClient(currentStock: number | null) {
  const calls: Call[] = [];
  const client = {
    query(text: string, params: unknown[] = []) {
      calls.push({ sql: text, params });
      if (/SELECT stock FROM products/.test(text)) {
        return Promise.resolve({ rows: currentStock === null ? [] : [{ stock: currentStock }] });
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    },
  };
  // The helper only uses `.query`; cast through unknown to satisfy the pg type.
  return { client: client as unknown as Parameters<typeof moveStock>[0], calls };
}

const base = {
  tenantId: "t-1",
  productId: "p-1",
  reason: "sale" as const,
};

describe("moveStock — balance + journal", () => {
  it("applies a negative delta and journals the new balance", async () => {
    const { client, calls } = stubClient(10);
    const res = await moveStock(client, { ...base, qtyDelta: -3 });

    expect(res).toEqual({ ok: true, balanceAfter: 7 });

    const update = calls.find((c) => /UPDATE products SET stock/.test(c.sql));
    expect(update?.params[0]).toBe(7); // writes the absolute new on-hand, not a delta

    const insert = calls.find((c) => /INSERT INTO stock_movements/.test(c.sql));
    expect(insert).toBeTruthy();
    // params: tenant, product, qty_delta, balance_after, reason, ...
    expect(insert?.params[2]).toBe(-3);
    expect(insert?.params[3]).toBe(7);
  });

  it("applies a positive delta (a receive)", async () => {
    const { client } = stubClient(40);
    const res = await moveStock(client, { ...base, qtyDelta: 50, reason: "po_receive" });
    expect(res).toEqual({ ok: true, balanceAfter: 90 });
  });
});

describe("moveStock — guards", () => {
  it("refuses to drive stock below zero and writes nothing", async () => {
    const { client, calls } = stubClient(2);
    const res = await moveStock(client, { ...base, qtyDelta: -5 });

    expect(res).toEqual({ ok: false, code: "NEGATIVE", available: 2 });
    expect(calls.some((c) => /UPDATE products/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO stock_movements/.test(c.sql))).toBe(false);
  });

  it("reports GONE when the product is missing for this tenant", async () => {
    const { client, calls } = stubClient(null);
    const res = await moveStock(client, { ...base, qtyDelta: -1 });

    expect(res).toEqual({ ok: false, code: "GONE" });
    expect(calls.some((c) => /INSERT INTO stock_movements/.test(c.sql))).toBe(false);
  });

  it("zero delta journals an observation without touching the stock column", async () => {
    const { client, calls } = stubClient(8);
    const res = await moveStock(client, { ...base, qtyDelta: 0, reason: "count" });

    expect(res).toEqual({ ok: true, balanceAfter: 8 });
    expect(calls.some((c) => /UPDATE products/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO stock_movements/.test(c.sql))).toBe(true);
  });
});

describe("ledger invariant — a sequence reconciles to on-hand", () => {
  it("receive +50, sell -3, adjust to 40 leaves SUM(deltas) == 40", async () => {
    // Mirrors the real flow: each call's balance_after feeds the next stub.
    let stock = 0;
    const deltas: number[] = [];
    const apply = async (qtyDelta: number) => {
      const { client } = stubClient(stock);
      const res = await moveStock(client, { ...base, qtyDelta, reason: "adjust" });
      if (res.ok) {
        stock = res.balanceAfter;
        deltas.push(qtyDelta);
      }
      return res;
    };

    await apply(50); // receive
    await apply(-3); // sale
    await apply(40 - stock); // owner recount to 40 → adjust delta

    expect(stock).toBe(40);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(40);
  });
});
