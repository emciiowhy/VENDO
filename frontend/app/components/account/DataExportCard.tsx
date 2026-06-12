"use client";

import { Icon, type IconName } from "../Icon";
import { SectionCard } from "./ui";
import { exportUrl, type ExportDataset } from "@/lib/account";

/**
 * Data export — download your store's records as CSV. The links hit the
 * tenant-scoped export endpoint; the session cookie rides on the top-level
 * download navigation, and the server streams an attachment.
 */
const DATASETS: { key: ExportDataset; label: string; sub: string; icon: IconName }[] = [
  { key: "sales", label: "Sales", sub: "Every receipt with VAT breakdown", icon: "receipt" },
  { key: "inventory", label: "Inventory", sub: "Products, prices and stock levels", icon: "box" },
  { key: "customers", label: "Customers", sub: "Loyalty book and contact details", icon: "heart" },
];

export function DataExportCard() {
  return (
    <SectionCard
      icon="download"
      title="Export your data"
      description="Download a CSV copy of your store's records anytime."
    >
      <div className="grid sm:grid-cols-3 gap-3">
        {DATASETS.map((d) => (
          <a
            key={d.key}
            href={exportUrl(d.key)}
            className="group flex flex-col gap-2 rounded-[12px] hairline bg-paper hover:bg-surface hover:shadow-card p-4 transition duration-150"
          >
            <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-brand-50 text-brand-600">
              <Icon name={d.icon} className="w-[18px] h-[18px]" />
            </span>
            <span className="text-[14px] font-bold tracking-tight">{d.label}</span>
            <span className="text-[12px] text-ink-soft leading-snug">{d.sub}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600">
              <Icon name="download" className="w-3.5 h-3.5" /> Download CSV
            </span>
          </a>
        ))}
      </div>
    </SectionCard>
  );
}
