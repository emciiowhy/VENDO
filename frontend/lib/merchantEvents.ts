/**
 * Client glue for the merchant real-time alert stream
 * (`/api/v1/merchant/events/stream`, SSE). The component opens an EventSource
 * with credentials so the cookie scopes it to the signed-in Tenant; this module
 * owns the URL and the `low-stock` payload shape.
 */
import { API_BASE_URL } from "./api";

export const MERCHANT_EVENTS_URL = `${API_BASE_URL}/api/v1/merchant/events/stream`;

export interface LowStockEvent {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  lowStockThreshold: number;
  depleted: boolean;
}
