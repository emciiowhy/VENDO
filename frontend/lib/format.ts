/**
 * Peso-first formatting. VendoPOS is built for the Philippine ecosystem, so the
 * default currency is PHP and the default locale en-PH — every figure renders
 * with the ₱ sign and grouped thousands.
 */
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

const pesoCents = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₱1,499 — whole pesos, for headline figures and plan prices. */
export function formatPeso(amount: number): string {
  return peso.format(amount);
}

/** ₱1,499.00 — centavo precision, for line items and receipts. */
export function formatPesoExact(amount: number): string {
  return pesoCents.format(amount);
}

/** 12,480 → "12,480"; compacts large counts when asked. */
export function formatCount(n: number, compact = false): string {
  return new Intl.NumberFormat("en-PH", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Centavo integer → ₱1,499.00 — line items, ledgers, exact figures. */
export function formatCents(cents: number): string {
  return pesoCents.format(cents / 100);
}

/** Centavo integer → ₱1,499 — whole pesos, for headline KPI figures. */
export function formatCentsWhole(cents: number): string {
  return peso.format(Math.round(cents / 100));
}

/** "Mar 14, 2026" — onboarding / registration timestamps. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
