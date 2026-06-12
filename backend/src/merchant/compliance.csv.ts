import type { ComplianceLedger } from "./merchant.repository.js";

/**
 * Pure helpers for the BIR compliance export — month-window resolution and CSV
 * serialization. Kept free of any DB/IO so they're unit-testable in isolation.
 */

export interface MonthWindow {
  /** First day of the month, `YYYY-MM-DD` (local Manila date, used as a naive timestamp). */
  periodStart: string;
  /** First day of the NEXT month (exclusive upper bound). */
  periodEnd: string;
  /** Human label, e.g. "June 2026". */
  label: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Resolve a `?month=YYYY-MM` query into an inclusive-start / exclusive-end
 * window. Falls back to the given "today" (defaults to now) when the param is
 * missing or malformed, so the endpoint always has a sane current-month export.
 */
export function resolveMonth(month: string | undefined, today: Date = new Date()): MonthWindow {
  let year: number;
  let mon: number; // 1-based
  const m = month?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    year = Number(m[1]);
    mon = Number(m[2]);
    if (mon < 1 || mon > 12) {
      year = today.getUTCFullYear();
      mon = today.getUTCMonth() + 1;
    }
  } else {
    year = today.getUTCFullYear();
    mon = today.getUTCMonth() + 1;
  }

  const startY = year;
  const startM = mon;
  const next = mon === 12 ? { y: year + 1, m: 1 } : { y: year, m: mon + 1 };

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    periodStart: `${startY}-${pad(startM)}-01`,
    periodEnd: `${next.y}-${pad(next.m)}-01`,
    label: `${MONTH_NAMES[mon - 1]} ${year}`,
  };
}

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
  "Invoice No",
  "Date",
  "Gross Sales (VAT-Incl)",
  "Net of VAT (Taxable)",
  "12% VAT",
  "Discounts",
  "Payment Method",
  "Reference",
];

/**
 * Serialize a compliance ledger to a CSV matrix: one row per serialized
 * invoice, chronological, with a trailing TOTALS row. Money is rendered as
 * plain decimal pesos so the file drops straight into a tax-prep spreadsheet.
 */
export function toCsv(ledger: ComplianceLedger): string {
  const lines: string[] = [];
  lines.push(HEADER.map(csvField).join(","));

  for (const r of ledger.rows) {
    lines.push(
      [
        r.reference,
        r.at,
        pesoDecimal(r.grossCents),
        pesoDecimal(r.netCents),
        pesoDecimal(r.vatCents),
        pesoDecimal(r.discountCents),
        r.paymentMethod,
        r.paymentRef ?? "",
      ]
        .map((v) => csvField(String(v)))
        .join(","),
    );
  }

  const t = ledger.totals;
  lines.push(
    [
      "TOTALS",
      `${t.count} invoices`,
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
