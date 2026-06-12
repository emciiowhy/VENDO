/**
 * Shared chip styling + label for purchase-order statuses, using only the
 * dark-safe design tokens (brand / accent / amber / ink). Kept in one place so
 * the table, drawer and pills never drift.
 */
export const STATUS_STYLE: Record<string, { label: string; chip: string }> = {
  draft: { label: "Draft", chip: "bg-paper hairline text-ink-soft" },
  ordered: { label: "Ordered", chip: "bg-amber-50 text-amber-600" },
  received: { label: "Received", chip: "bg-accent-50 text-accent-600" },
  cancelled: { label: "Cancelled", chip: "bg-rose-50 text-rose-600" },
};
