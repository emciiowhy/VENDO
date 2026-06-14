/**
 * Client for the Super Admin platform-compliance oversight
 * (`/api/v1/admin/compliance/*`). SUPER_ADMIN-only server-side; the session
 * cookie rides along with `credentials: "include"`. Money is integer centavos
 * on the wire.
 */
import { API_BASE_URL } from "./api";

const BASE = `${API_BASE_URL}/api/v1/admin/compliance`;

export interface TenantComplianceRow {
  tenantId: string;
  tenant: string;
  plan: string;
  invoiceCount: number;
  reversalCount: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  discountCents: number;
  firstSerial: string | null;
  lastSerial: string | null;
}

export interface PlatformComplianceSummary {
  periodStart: string;
  periodEnd: string;
  rows: TenantComplianceRow[];
  totals: {
    filedStores: number;
    silentStores: number;
    invoiceCount: number;
    reversalCount: number;
    grossCents: number;
    netCents: number;
    vatCents: number;
    discountCents: number;
  };
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error?: string };

async function readJson<T>(res: Response): Promise<Result<T>> {
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: "Unexpected server response." };
  }
}

const NETWORK_ERR = {
  ok: false as const,
  error: "Could not reach the server. Check your connection.",
};

export async function getPlatformCompliance(
  month: string,
): Promise<Result<{ label: string; summary: PlatformComplianceSummary }>> {
  try {
    return await readJson(
      await fetch(`${BASE}/summary?month=${encodeURIComponent(month)}`, {
        credentials: "include",
      }),
    );
  } catch {
    return NETWORK_ERR;
  }
}

/**
 * Absolute URL that streams a month's VAT rollup as a CSV. With no `tenantId`
 * it's the consolidated platform file; with one it narrows to a single store's
 * filing report (the per-row download action).
 */
export function platformComplianceCsvUrl(month: string, tenantId?: string): string {
  const params = new URLSearchParams({ month });
  if (tenantId) params.set("tenantId", tenantId);
  return `${BASE}/export?${params.toString()}`;
}
