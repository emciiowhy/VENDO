/**
 * Pure assembly of the merchant Balance Sheet + Cash Flow statements from raw
 * centavo figures the repository pulls out of the ledgers. There is NO IO here,
 * so the accounting maths is unit-testable in isolation (see finance.reports.test.ts).
 * Money is integer centavos throughout.
 *
 * These are pragmatic SMB statements derived from what VendoPOS already records
 * (sales, expenses, purchase orders, on-hand stock) — not double-entry GAAP. The
 * cash figure is defined CONSISTENTLY across both statements so they reconcile:
 *
 *   cash = Σ sales collected − Σ operating expenses − Σ goods received (at cost)
 *
 * On the balance sheet, receiving stock moves value from cash into inventory
 * (assets unchanged); a sale raises cash and a matching VAT-payable liability;
 * an expense lowers cash and therefore equity. Owner's equity is the balancing
 * figure (assets − liabilities), so the sheet always ties out.
 */

export interface LineItem {
  label: string;
  amountCents: number;
}

// ── Balance sheet ────────────────────────────────────────────────────────────

export interface BalanceSheetRaw {
  /** Cumulative cash: collections − expenses − goods received (see header). */
  cashCents: number;
  /** Σ on-hand stock × latest known unit cost. */
  inventoryValueCents: number;
  /** Cumulative output VAT collected, owed to the BIR. */
  vatPayableCents: number;
  /** Open purchase orders (draft + ordered) — goods owed to suppliers. */
  accountsPayableCents: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: { items: LineItem[]; totalCents: number };
  liabilities: { items: LineItem[]; totalCents: number };
  equity: { items: LineItem[]; totalCents: number };
  /** Invariant sanity check: assets === liabilities + equity. */
  balanced: boolean;
}

export function buildBalanceSheet(asOf: string, raw: BalanceSheetRaw): BalanceSheet {
  const assetItems: LineItem[] = [
    { label: "Cash & equivalents", amountCents: raw.cashCents },
    { label: "Inventory on hand (at cost)", amountCents: raw.inventoryValueCents },
  ];
  const assetsTotal = assetItems.reduce((s, i) => s + i.amountCents, 0);

  const liabilityItems: LineItem[] = [
    { label: "Output VAT payable", amountCents: raw.vatPayableCents },
    { label: "Accounts payable (open POs)", amountCents: raw.accountsPayableCents },
  ];
  const liabilitiesTotal = liabilityItems.reduce((s, i) => s + i.amountCents, 0);

  // Owner's equity is the residual claim on assets after liabilities.
  const equityCents = assetsTotal - liabilitiesTotal;
  const equityItems: LineItem[] = [
    { label: "Owner's equity (retained)", amountCents: equityCents },
  ];

  return {
    asOf,
    assets: { items: assetItems, totalCents: assetsTotal },
    liabilities: { items: liabilityItems, totalCents: liabilitiesTotal },
    equity: { items: equityItems, totalCents: equityCents },
    balanced: assetsTotal === liabilitiesTotal + equityCents,
  };
}

// ── Cash flow (direct method, single period) ─────────────────────────────────

export interface CashFlowRaw {
  /** Cash in from sales settled in the period (contra void/return netted). */
  salesCollectedCents: number;
  /** Operating expenses incurred in the period. */
  expensesPaidCents: number;
  /** Cost of purchase orders received in the period. */
  goodsReceivedCents: number;
  /** Cash position immediately before the period opened. */
  openingCashCents: number;
}

export interface CashFlow {
  periodStart: string;
  periodEnd: string;
  inflows: LineItem[];
  /** Outflow amounts are stored positive; the UI renders them as subtractions. */
  outflows: LineItem[];
  netChangeCents: number;
  openingCashCents: number;
  closingCashCents: number;
}

export function buildCashFlow(
  periodStart: string,
  periodEnd: string,
  raw: CashFlowRaw,
): CashFlow {
  const inflows: LineItem[] = [
    { label: "Sales collections", amountCents: raw.salesCollectedCents },
  ];
  const outflows: LineItem[] = [
    { label: "Operating expenses", amountCents: raw.expensesPaidCents },
    { label: "Inventory purchases received", amountCents: raw.goodsReceivedCents },
  ];
  const inflowTotal = inflows.reduce((s, i) => s + i.amountCents, 0);
  const outflowTotal = outflows.reduce((s, i) => s + i.amountCents, 0);
  const netChangeCents = inflowTotal - outflowTotal;

  return {
    periodStart,
    periodEnd,
    inflows,
    outflows,
    netChangeCents,
    openingCashCents: raw.openingCashCents,
    closingCashCents: raw.openingCashCents + netChangeCents,
  };
}
