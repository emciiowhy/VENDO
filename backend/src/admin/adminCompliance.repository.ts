import { query } from "../db.js";

/**
 * Platform-wide BIR compliance oversight for the Super Admin. Where the merchant
 * compliance tray (see merchant/merchant.repository.ts) compiles ONE Tenant's
 * serialized ledger, this rolls the whole ecosystem up one calendar month at a
 * time: every active store's output-VAT position side by side, plus a
 * consolidated platform total the operator can reconcile against remittances.
 *
 * These figures sit above any single Tenant (the operator is platform-level), so
 * — like the billing analytics — the queries are deliberately NOT fenced to a
 * tenant_id. Month boundaries are compared in Manila time so a sale at 11pm on
 * the last day lands in the right filing period.
 */

const MNL = "Asia/Manila";

export interface TenantComplianceRow {
  tenantId: string;
  tenant: string;
  plan: string;
  /** Forward invoices issued this month (kind = 'sale'). */
  invoiceCount: number;
  /** Voids + returns issued this month (contra rows). */
  reversalCount: number;
  /** Gross VAT-inclusive revenue, net of reversals (centavos). */
  grossCents: number;
  /** Net taxable base, net of reversals (centavos). */
  netCents: number;
  /** 12% output VAT, net of reversals (centavos). */
  vatCents: number;
  /** Customer discounts applied (centavos). */
  discountCents: number;
  /** First serialized invoice number issued in the period (e.g. "SI-000045"). */
  firstSerial: string | null;
  /** Last serialized invoice number issued in the period. */
  lastSerial: string | null;
}

export interface PlatformComplianceSummary {
  periodStart: string;
  periodEnd: string;
  rows: TenantComplianceRow[];
  totals: {
    /** Active stores that filed at least one invoice this month. */
    filedStores: number;
    /** Active stores with zero sales this month (a compliance watch item). */
    silentStores: number;
    invoiceCount: number;
    reversalCount: number;
    grossCents: number;
    netCents: number;
    vatCents: number;
    discountCents: number;
  };
}

interface SummaryDbRow {
  id: string;
  name: string;
  plan: string;
  invoice_count: number;
  reversal_count: number;
  gross: string;
  net: string;
  vat: string;
  discount: string;
  first_serial: string | null;
  last_serial: string | null;
}

/**
 * Aggregate every active Tenant's serialized sales for one Manila calendar month
 * into a single oversight table. Reversal rows are negative `sales` rows, so the
 * money sums net them automatically; forward invoice counts are taken via a
 * FILTER so the issued-serial span (`min`/`max reference`) reflects real
 * receipts, not contra entries. Ordered by output VAT so the heaviest-remitting
 * stores surface first.
 */
export async function getPlatformComplianceSummary(
  periodStart: string,
  periodEnd: string,
): Promise<PlatformComplianceSummary> {
  const { rows } = await query<SummaryDbRow>(
    `SELECT t.id, t.name, t.plan,
            count(*) FILTER (WHERE s.kind = 'sale')             AS invoice_count,
            count(*) FILTER (WHERE s.kind IN ('void','return')) AS reversal_count,
            coalesce(sum(s.total_cents), 0)::bigint             AS gross,
            coalesce(sum(s.subtotal_cents), 0)::bigint          AS net,
            coalesce(sum(s.vat_cents), 0)::bigint               AS vat,
            coalesce(sum(s.discount_cents), 0)::bigint          AS discount,
            min(s.reference) FILTER (WHERE s.kind = 'sale')     AS first_serial,
            max(s.reference) FILTER (WHERE s.kind = 'sale')     AS last_serial
       FROM tenants t
       LEFT JOIN sales s
         ON s.tenant_id = t.id
        AND (s.created_at AT TIME ZONE $3) >= $1::timestamp
        AND (s.created_at AT TIME ZONE $3) <  $2::timestamp
      WHERE t.status = 'active'
      GROUP BY t.id, t.name, t.plan
      ORDER BY vat DESC, t.name ASC`,
    [periodStart, periodEnd, MNL],
  );

  const out: TenantComplianceRow[] = rows.map((r) => ({
    tenantId: r.id,
    tenant: r.name,
    plan: r.plan,
    invoiceCount: Number(r.invoice_count),
    reversalCount: Number(r.reversal_count),
    grossCents: Number(r.gross),
    netCents: Number(r.net),
    vatCents: Number(r.vat),
    discountCents: Number(r.discount),
    firstSerial: r.first_serial,
    lastSerial: r.last_serial,
  }));

  const totals = out.reduce(
    (acc, r) => {
      acc.invoiceCount += r.invoiceCount;
      acc.reversalCount += r.reversalCount;
      acc.grossCents += r.grossCents;
      acc.netCents += r.netCents;
      acc.vatCents += r.vatCents;
      acc.discountCents += r.discountCents;
      if (r.invoiceCount > 0) acc.filedStores += 1;
      else acc.silentStores += 1;
      return acc;
    },
    {
      filedStores: 0,
      silentStores: 0,
      invoiceCount: 0,
      reversalCount: 0,
      grossCents: 0,
      netCents: 0,
      vatCents: 0,
      discountCents: 0,
    },
  );

  return { periodStart, periodEnd, rows: out, totals };
}
