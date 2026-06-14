/**
 * Client glue for the Super Admin System Health SSE stream
 * (`/api/v1/admin/health/stream`). The component opens an EventSource itself
 * (with credentials so the session cookie scopes it to SUPER_ADMIN); this
 * module just owns the URL and the event payload shapes.
 */
import { API_BASE_URL } from "./api";

export const HEALTH_STREAM_URL = `${API_BASE_URL}/api/v1/admin/health/stream`;

const METRICS_URL = `${API_BASE_URL}/api/v1/admin/health/metrics`;

type Result<T> = ({ ok: true } & T) | { ok: false; error?: string };

/**
 * One-shot infrastructure vitals (pool occupancy + a fresh query round-trip),
 * for views that want the numbers once on load without holding an SSE stream
 * open — e.g. the Platform Overview telemetry strip.
 */
export async function getServerMetrics(): Promise<Result<{ metrics: ServerMetrics }>> {
  try {
    const res = await fetch(METRICS_URL, { credentials: "include" });
    return (await res.json()) as Result<{ metrics: ServerMetrics }>;
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

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
