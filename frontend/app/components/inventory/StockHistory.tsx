"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Pagination } from "../Pagination";
import {
  listProducts,
  listStockMovements,
  type MovementType,
  type Product,
  type StockMovement,
} from "@/lib/inventory";

/**
 * Product Management → Stock history. The store-wide stock-movement ledger:
 * every sale, void, return and manual stock change, with who made it and the
 * balance it left. Filter by product, type and date range; the summary shows
 * units in / out across the whole filtered set. Server-paginated (the ledger
 * grows without bound); tenant-scoped server-side. Times are Manila time.
 */

const TYPES: { id: "" | MovementType; label: string }[] = [
  { id: "", label: "All changes" },
  { id: "sales", label: "Sales" },
  { id: "reversals", label: "Voids & returns" },
  { id: "manual", label: "Manual changes" },
  { id: "received", label: "Received (old purchase orders)" },
  { id: "production", label: "Production (retired)" },
];

type Tone = "out" | "in" | "neutral";

/** A human label for one movement. Manual edits carry the form's reason in the note. */
function describe(m: StockMovement): { label: string; tone: Tone; detail: string | null } {
  switch (m.reason) {
    case "sale":
      return { label: "Sale", tone: "out", detail: null };
    case "sale_void":
      return { label: "Sale voided", tone: "in", detail: m.note };
    case "return":
      return { label: "Return", tone: "in", detail: m.note };
    case "po_receive":
      return { label: "Received", tone: "in", detail: m.note };
    case "produce_consume":
      return { label: "Used in production", tone: "out", detail: m.note };
    case "produce_output":
      return { label: "Produced", tone: "in", detail: m.note };
    case "count":
      return { label: m.note === "Opening stock" ? "Opening stock" : "Stock count", tone: "neutral", detail: null };
    case "adjust": {
      const reason = m.note?.replace(/\s*\(manual stock edit\)$/, "");
      const known = reason && reason !== "Manual stock edit";
      return { label: known ? reason : "Manual edit", tone: "neutral", detail: null };
    }
  }
}

const TONE_CHIP: Record<Tone, string> = {
  out: "bg-paper hairline text-ink-soft",
  in: "bg-accent-50 text-accent-600",
  neutral: "bg-brand-50 text-brand-700",
};

function when(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }),
    time: d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }),
  };
}

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; movements: StockMovement[]; total: number; unitsIn: number; unitsOut: number };

export function StockHistory({
  productId,
  onProductChange,
}: {
  /** The product filter, owned by the parent so a product row can deep-link here. */
  productId: string;
  onProductChange: (productId: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [type, setType] = useState<"" | MovementType>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [state, setState] = useState<State>({ status: "loading" });
  // A new filter starts again at page 1 — derived, so no extra render pass.
  const filterKey = `${productId}|${type}|${from}|${to}|${pageSize}`;
  const [pageFor, setPageFor] = useState(filterKey);
  const current = pageFor === filterKey ? page : 1;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listProducts();
      if (alive && res.ok) setProducts([...res.products].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await listStockMovements({
        productId: productId || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
        page: current,
        pageSize,
      });
      if (!alive) return;
      if (res.ok) {
        setState({ status: "ready", movements: res.movements, total: res.total, unitsIn: res.unitsIn, unitsOut: res.unitsOut });
      } else {
        setState({ status: "error", message: res.error ?? "Could not load stock history." });
      }
    })();
    return () => {
      alive = false;
    };
  }, [productId, type, from, to, current, pageSize]);

  function goPage(p: number) {
    setPage(p);
    setPageFor(filterKey);
  }

  const filtered = Boolean(productId || type || from || to);
  const product = products.find((p) => p.id === productId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[1.4rem] font-extrabold tracking-tightest">Stock history</h2>
        <p className="text-[13.5px] text-ink-soft">
          Every change to stock on hand — sales, voids and returns, and manual changes with their reason and who made
          them.
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_auto] items-end">
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">Product</span>
          <select
            value={productId}
            onChange={(e) => onProductChange(e.target.value)}
            className="field-input mt-1 w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` · ${p.sku}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "" | MovementType)}
            className="field-input mt-1 w-full rounded-[10px] px-3.5 py-2.5 text-[14px] text-ink"
          >
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">From</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="field-input mt-1 w-full rounded-[10px] px-3 py-2.5 text-[14px] text-ink"
          />
        </label>
        <label className="block">
          <span className="text-[12px] font-semibold text-ink-faint">To</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="field-input mt-1 w-full rounded-[10px] px-3 py-2.5 text-[14px] text-ink"
          />
        </label>
        <button
          type="button"
          disabled={!filtered}
          onClick={() => {
            onProductChange("");
            setType("");
            setFrom("");
            setTo("");
          }}
          className="h-[42px] px-3.5 rounded-[10px] text-[13.5px] font-semibold text-ink-soft hover:text-ink bg-surface hairline transition disabled:opacity-40 disabled:pointer-events-none"
        >
          Clear
        </button>
      </div>

      {/* Summary for the filtered set */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Units in" value={state.status === "ready" ? `+${state.unitsIn}` : "…"} tone="in" />
        <Summary label="Units out" value={state.status === "ready" ? `−${state.unitsOut}` : "…"} tone="out" />
        <Summary
          label={product ? `${product.name} on hand now` : "Changes"}
          value={product ? String(product.stock) : state.status === "ready" ? String(state.total) : "…"}
          tone="neutral"
        />
      </div>

      <div className="rounded-xl2 bg-surface hairline shadow-card overflow-hidden">
        {state.status === "error" ? (
          <p className="px-6 py-12 text-center text-[14px] font-semibold text-rose-600">{state.message}</p>
        ) : state.status === "loading" ? (
          <div className="p-5 space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded-[10px] bg-paper animate-pulse" />
            ))}
          </div>
        ) : state.movements.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Icon name="activity" className="w-7 h-7 mx-auto text-ink-faint" strokeWidth={1.6} />
            <p className="mt-3 text-[13.5px] text-ink-soft">
              {filtered ? "No stock changes match these filters." : "No stock changes yet. They appear here as you sell and restock."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="text-[11.5px] font-bold uppercase tracking-wider text-ink-faint hairline-b">
                  <th className="px-5 py-3">When</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">Stock after</th>
                  <th className="px-5 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(11,18,32,0.06)] dark:divide-[rgba(255,255,255,0.07)]">
                {state.movements.map((m) => {
                  const d = describe(m);
                  const t = when(m.createdAt);
                  return (
                    <tr key={m.id} className="text-[13.5px]">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-semibold">{t.date}</div>
                        <div className="text-[12px] text-ink-faint">{t.time}</div>
                      </td>
                      <td className="px-4 py-3">
                        {m.productName ? (
                          <button
                            type="button"
                            onClick={() => onProductChange(m.productId)}
                            className="font-semibold text-left hover:text-brand-600 transition"
                            title="Show only this product"
                          >
                            {m.productName}
                          </button>
                        ) : (
                          <span className="text-ink-faint">Deleted product</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={"inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold " + TONE_CHIP[d.tone]}>
                          {d.label}
                        </span>
                        {d.detail && <div className="mt-0.5 text-[12px] text-ink-faint max-w-[28ch] truncate">{d.detail}</div>}
                      </td>
                      <td
                        className={
                          "px-4 py-3 text-right font-bold tabular-nums " +
                          (m.qtyDelta > 0 ? "text-accent-600" : m.qtyDelta < 0 ? "text-rose-600" : "text-ink-faint")
                        }
                      >
                        {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta < 0 ? `−${-m.qtyDelta}` : "0"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{m.balanceAfter}</td>
                      <td className="px-5 py-3 text-ink-soft">{m.createdByName ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {state.status === "ready" && state.total > 0 && (
          <Pagination
            page={current}
            total={state.total}
            pageSize={pageSize}
            onPage={goPage}
            onPageSize={setPageSize}
            noun="changes"
          />
        )}
      </div>
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card px-5 py-4">
      <div className="text-[12px] font-semibold text-ink-faint truncate">{label}</div>
      <div
        className={
          "mt-1 text-[1.45rem] font-extrabold tracking-tightest tabular-nums " +
          (tone === "in" ? "text-accent-600" : tone === "out" ? "text-rose-600" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
