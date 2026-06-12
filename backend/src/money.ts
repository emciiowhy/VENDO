/** Server-side peso formatting for centavo integers (used in user-facing messages). */
const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 15450 → "₱154.50". */
export function formatPeso(cents: number): string {
  return `₱${peso.format(cents / 100)}`;
}
