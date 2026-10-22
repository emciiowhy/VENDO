"use client";

import { useState } from "react";
import { Icon, type IconName } from "../Icon";
import { InventoryMatrix } from "./InventoryMatrix";
import { StockHistory } from "./StockHistory";

/**
 * Product Management — two tabs over the same catalog:
 *   • Products — the catalog CRUD matrix.
 *   • Stock history — the stock-movement ledger behind every on-hand number.
 * A product row's history button jumps to Stock history filtered to it.
 * `?tab=history&product=<id>` deep-links (the URL is kept in sync).
 */

type Tab = "products" | "history";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "products", label: "Products", icon: "box" },
  { id: "history", label: "Stock history", icon: "activity" },
];

function readUrl(): { tab: Tab; product: string } {
  if (typeof window === "undefined") return { tab: "products", product: "" };
  const q = new URLSearchParams(window.location.search);
  return { tab: q.get("tab") === "history" ? "history" : "products", product: q.get("product") ?? "" };
}

function writeUrl(tab: Tab, product: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  if (tab === "history" && product) url.searchParams.set("product", product);
  else url.searchParams.delete("product");
  window.history.replaceState(window.history.state, "", url);
}

export function ProductManagement() {
  const [initial] = useState(readUrl);
  const [tab, setTabState] = useState<Tab>(initial.tab);
  const [product, setProductState] = useState(initial.product);
  // Mount history lazily, then keep both mounted so switching tabs keeps
  // filters, scroll and any open product form.
  const [historySeen, setHistorySeen] = useState(initial.tab === "history");

  function setTab(next: Tab, nextProduct = product) {
    setTabState(next);
    setProductState(nextProduct);
    if (next === "history") setHistorySeen(true);
    writeUrl(next, nextProduct);
  }

  return (
    <div className="space-y-6 max-w-[1180px]">
      <div role="tablist" aria-label="Product Management sections" className="flex items-center gap-1 p-1 rounded-[14px] bg-paper hairline w-full sm:w-fit overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              className={
                "shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-[10px] text-[13.5px] font-semibold whitespace-nowrap transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 " +
                (on ? "bg-surface text-ink shadow-card" : "text-ink-soft hover:text-ink")
              }
            >
              <Icon name={t.icon} className={"w-4 h-4 " + (on ? "text-brand-600" : "")} strokeWidth={1.8} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div hidden={tab !== "products"}>
        <InventoryMatrix onHistory={(p) => setTab("history", p.id)} />
      </div>
      {historySeen && (
        <div hidden={tab !== "history"}>
          <StockHistory productId={product} onProductChange={(id) => setTab("history", id)} />
        </div>
      )}
    </div>
  );
}
