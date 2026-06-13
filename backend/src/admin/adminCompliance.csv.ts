import type { PlatformComplianceSummary } from "./adminCompliance.repository.js";

/**
 * Pure CSV serializer for the platform-wide compliance summary. One row per
 * active Tenant with its monthly output-VAT position, plus a trailing TOTALS
 * row, so the consolidated file drops straight into the operator's remittance
 * reconciliation spreadsheet. No DB/IO here — unit-testable in isolation, like
 * its merchant-side sibling (merchant/compliance.csv.ts).
 */

/** 15450 → "154.50" — plain decimal pesos for spreadsheet math (no ₱ symbol). */
function pesoDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Escape a CSV field per RFC 4180 (quote if it contains comma/quote/newline). */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const HEADER = [
  "Store",
  "Plan",
  "Invoices",
  "Reversals",
  "Gross Sales (VAT-Incl)",
  "Net of VAT (Taxable)",
  "12% VAT",
  "Discounts",
  "Serial From",
  "Serial To",
];

export function toPlatformCsv(summary: PlatformComplianceSummary): string {
  const lines: string[] = [];
  lines.push(HEADER.map(csvField).join(","));

  for (const r of summary.rows) {
    lines.push(
      [
        r.tenant,
        r.plan,
        String(r.invoiceCount),
        String(r.reversalCount),
        pesoDecimal(r.grossCents),
        pesoDecimal(r.netCents),
        pesoDecimal(r.vatCents),
        pesoDecimal(r.discountCents),
        r.firstSerial ?? "",
        r.lastSerial ?? "",
      ]
        .map((v) => csvField(String(v)))
        .join(","),
    );
  }

  const t = summary.totals;
  lines.push(
    [
      `TOTALS (${t.filedStores} filing / ${t.silentStores} silent)`,
      "",
      String(t.invoiceCount),
      String(t.reversalCount),
      pesoDecimal(t.grossCents),
      pesoDecimal(t.netCents),
      pesoDecimal(t.vatCents),
      pesoDecimal(t.discountCents),
      "",
      "",
    ]
      .map((v) => csvField(String(v)))
      .join(","),
  );

  // Trailing newline keeps POSIX tools happy.
  return lines.join("\r\n") + "\r\n";
}
