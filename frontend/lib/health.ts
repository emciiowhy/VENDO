/**
 * Client glue for the Super Admin System Health SSE stream
 * (`/api/v1/admin/health/stream`). The component opens an EventSource itself
 * (with credentials so the session cookie scopes it to SUPER_ADMIN); this
 * module just owns the URL and the event payload shapes.
 */
import { API_BASE_URL } from "./api";

export const HEALTH_STREAM_URL = `${API_BASE_URL}/api/v1/admin/health/stream`;

export interface ActivityEvent {
  id: string;
  kind: "sale" | "product";
  tenant: string;
  at: string;
  amountCents: number | null;
  detail: string;
}

export interface VarianceAlert {
  id: string;
  tenant: string;
  cashierName: string;
  /** counted − expected: + overage / − shortage (centavos). */
  varianceCents: number;
  expectedCashCents: number;
  countedCashCents: number;
  at: string;
}

export interface ServerMetrics {
  at: string;
  pool: {
    total: number;
    idle: number;
    active: number;
    waiting: number;
    max: number;
  };
  latencyMs: number;
}
