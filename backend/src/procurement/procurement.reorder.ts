/**
 * Reorder-suggestion helpers. The qty maths is a pure function so it can be
 * unit-tested without a database (see procurement.reorder.test.ts). A low-stock
 * product becomes a suggested purchase-order line; the owner reviews and turns
 * the selection into a single DRAFT purchase order.
 */

export interface ReorderSuggestion {
  productId: string;
  name: string;
  sku: string | null;
  stock: number;
  threshold: number;
  /** How many to order to comfortably clear the low-stock floor. */
  suggestedQty: number;
  /** The product's most recent known purchase cost (centavos), 0 if never bought. */
  lastUnitCostCents: number;
}

/**
 * Suggest a reorder quantity that brings on-hand up to roughly twice the
 * low-stock threshold (a one-cycle buffer), never less than 1. When no threshold
 * is set the target is 1, so a fully-depleted item still suggests at least one.
 */
export function suggestReorderQty(stock: number, threshold: number): number {
  const target = Math.max(threshold * 2, 1);
  return Math.max(target - stock, 1);
}
