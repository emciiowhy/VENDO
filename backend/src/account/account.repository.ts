import { query } from "../db.js";
import {
  normalizeThemeConfig,
  resolveThemeConfig,
  type MerchantThemeConfig,
} from "../merchant/theme.config.js";

/**
 * Data access for the owner Account hub — store profile, receipt customization,
 * personal profile, preferences, device sessions, login audit, data export and
 * store deactivation. Tenant/user scope always comes from the verified session
 * (passed in by the router), never the request body, so one store can only ever
 * read or change its own rows.
 */

// ── Store / business profile ────────────────────────────────────────────────

export interface StoreProfile {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  businessHours: string | null;
  tin: string | null;
  logoUrl: string | null;
  /** The store's chosen brand accent as `#rrggbb`, or null for the default. */
  themeColor: string | null;
}

export async function getStoreProfile(tenantId: string): Promise<StoreProfile | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    slug: string | null;
    plan: string;
    status: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    business_hours: string | null;
    tin: string | null;
    logo_url: string | null;
    theme_color: string | null;
  }>(
    `SELECT id, name, slug, plan, status, address, phone, email, business_hours, tin, logo_url, theme_color
       FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: r.plan,
    status: r.status,
    address: r.address,
    phone: r.phone,
    email: r.email,
    businessHours: r.business_hours,
    tin: r.tin,
    logoUrl: r.logo_url,
    themeColor: r.theme_color,
  };
}

/** Set (or clear, with null) the store's brand accent colour. */
export async function setThemeColor(tenantId: string, hex: string | null): Promise<void> {
  await query(`UPDATE tenants SET theme_color = $2 WHERE id = $1`, [tenantId, hex]);
}

// ── Merchant Theme Configuration (storefront skin) ──────────────────────────

/**
 * The store's full storefront theme config, or null if it has never set one.
 * The stored JSONB is re-validated through `resolveThemeConfig` on read, so a
 * blob written by an older shape (or hand-edited) still resolves to a complete,
 * renderable config.
 */
export async function getThemeConfig(tenantId: string): Promise<MerchantThemeConfig | null> {
  const { rows } = await query<{ theme_config: unknown }>(
    `SELECT theme_config FROM tenants WHERE id = $1`,
    [tenantId],
  );
  if (rows.length === 0) return null;
  return resolveThemeConfig(rows[0].theme_config);
}

/**
 * Persist the store's theme config. The config is the single source of truth;
 * we also mirror its `primaryColor` into the legacy `theme_color` column in the
 * same statement so the existing accent pipeline (POS terminal + customer
 * display, which read `theme_color`) stays in lockstep without a second write.
 * Returns the normalised config that was actually stored.
 */
export async function setThemeConfig(
  tenantId: string,
  input: unknown,
): Promise<MerchantThemeConfig> {
  const config = normalizeThemeConfig(input);
  await query(`UPDATE tenants SET theme_config = $2, theme_color = $3 WHERE id = $1`, [
    tenantId,
    JSON.stringify(config),
    config.primaryColor,
  ]);
  return config;
}

export interface StoreProfilePatch {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  businessHours: string | null;
  tin: string | null;
}

export async function updateStoreProfile(tenantId: string, p: StoreProfilePatch): Promise<void> {
  await query(
    `UPDATE tenants
        SET name = $2, address = $3, phone = $4, email = $5, business_hours = $6, tin = $7
      WHERE id = $1`,
    [tenantId, p.name, p.address, p.phone, p.email, p.businessHours, p.tin],
  );
}

/** Whether another tenant already owns this Store ID (slug). */
export async function slugTakenByOther(slug: string, tenantId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM tenants WHERE lower(slug) = lower($1) AND id <> $2 LIMIT 1`,
    [slug, tenantId],
  );
  return rows.length > 0;
}

export async function updateStoreSlug(tenantId: string, slug: string): Promise<void> {
  await query(`UPDATE tenants SET slug = lower($2) WHERE id = $1`, [tenantId, slug]);
}

/** Point the tenant at a new (or cleared) logo URL; returns the prior URL for cleanup. */
export async function setLogoUrl(tenantId: string, url: string | null): Promise<string | null> {
  const { rows } = await query<{ logo_url: string | null }>(
    `SELECT logo_url FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const prior = rows[0]?.logo_url ?? null;
  await query(`UPDATE tenants SET logo_url = $2 WHERE id = $1`, [tenantId, url]);
  return prior;
}

// ── Receipt / invoice customization ─────────────────────────────────────────

export interface ReceiptSettings {
  header: string | null;
  footer: string | null;
  vatLabel: string | null;
  invoicePrefix: string | null;
  showLogo: boolean;
  /** BIR machine-accreditation footer fields (all optional). */
  ptu: string | null;
  min: string | null;
  serial: string | null;
}

export async function getReceiptSettings(tenantId: string): Promise<ReceiptSettings | null> {
  const { rows } = await query<{
    receipt_header: string | null;
    receipt_footer: string | null;
    vat_label: string | null;
    invoice_prefix: string | null;
    receipt_show_logo: boolean;
    receipt_ptu: string | null;
    receipt_min: string | null;
    receipt_serial: string | null;
  }>(
    `SELECT receipt_header, receipt_footer, vat_label, invoice_prefix, receipt_show_logo,
            receipt_ptu, receipt_min, receipt_serial
       FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    header: r.receipt_header,
    footer: r.receipt_footer,
    vatLabel: r.vat_label,
    invoicePrefix: r.invoice_prefix,
    showLogo: r.receipt_show_logo,
    ptu: r.receipt_ptu,
    min: r.receipt_min,
    serial: r.receipt_serial,
  };
}

export async function updateReceiptSettings(tenantId: string, s: ReceiptSettings): Promise<void> {
  await query(
    `UPDATE tenants
        SET receipt_header = $2, receipt_footer = $3, vat_label = $4,
            invoice_prefix = $5, receipt_show_logo = $6,
            receipt_ptu = $7, receipt_min = $8, receipt_serial = $9
      WHERE id = $1`,
    [tenantId, s.header, s.footer, s.vatLabel, s.invoicePrefix, s.showLogo, s.ptu, s.min, s.serial],
  );
}

// ── Personal profile ────────────────────────────────────────────────────────

export interface OwnerProfile {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
}

export async function getOwnerProfile(userId: string): Promise<OwnerProfile | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    avatar_url: string | null;
    role: string;
  }>(
    `SELECT id, name, email, phone, avatar_url, role FROM users WHERE id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return { userId: r.id, name: r.name, email: r.email, phone: r.phone, avatarUrl: r.avatar_url, role: r.role };
}

export async function updateOwnerProfile(
  userId: string,
  p: { name: string; phone: string | null },
): Promise<void> {
  await query(`UPDATE users SET name = $2, phone = $3 WHERE id = $1`, [userId, p.name, p.phone]);
}

/** Set/clear avatar; returns the prior URL for cleanup. */
export async function setAvatarUrl(userId: string, url: string | null): Promise<string | null> {
  const { rows } = await query<{ avatar_url: string | null }>(
    `SELECT avatar_url FROM users WHERE id = $1`,
    [userId],
  );
  const prior = rows[0]?.avatar_url ?? null;
  await query(`UPDATE users SET avatar_url = $2 WHERE id = $1`, [userId, url]);
  return prior;
}

// ── Preferences ─────────────────────────────────────────────────────────────

export interface Preferences {
  theme: "light" | "dark" | "system";
  notifyLowStock: boolean;
  notifyVariance: boolean;
  notifyDailySummary: boolean;
}

export async function getPreferences(userId: string): Promise<Preferences | null> {
  const { rows } = await query<{
    theme: Preferences["theme"];
    notify_low_stock: boolean;
    notify_variance: boolean;
    notify_daily_summary: boolean;
  }>(
    `SELECT theme, notify_low_stock, notify_variance, notify_daily_summary
       FROM users WHERE id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    theme: r.theme,
    notifyLowStock: r.notify_low_stock,
    notifyVariance: r.notify_variance,
    notifyDailySummary: r.notify_daily_summary,
  };
}

export async function updatePreferences(userId: string, p: Preferences): Promise<void> {
  await query(
    `UPDATE users
        SET theme = $2, notify_low_stock = $3, notify_variance = $4, notify_daily_summary = $5
      WHERE id = $1`,
    [userId, p.theme, p.notifyLowStock, p.notifyVariance, p.notifyDailySummary],
  );
}

// ── Device sessions ─────────────────────────────────────────────────────────

export interface DeviceSession {
  id: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** A user's live (non-revoked) sessions, most-recently-active first. */
export async function listSessions(userId: string, currentSid?: string | null): Promise<DeviceSession[]> {
  const { rows } = await query<{
    id: string;
    method: string;
    ip: string | null;
    user_agent: string | null;
    created_at: Date;
    last_seen_at: Date;
  }>(
    `SELECT id, method, ip, user_agent, created_at, last_seen_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL
      ORDER BY last_seen_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    method: r.method,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    current: !!currentSid && r.id === currentSid,
  }));
}

/** Revoke one of the user's own sessions. Returns false if it isn't theirs. */
export async function revokeOwnSession(userId: string, sid: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE sessions SET revoked_at = now()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sid, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Sign out every other device — revoke all the user's sessions except `keepSid`. */
export async function revokeOtherSessions(userId: string, keepSid: string | null): Promise<number> {
  const { rowCount } = await query(
    `UPDATE sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
    [userId, keepSid],
  );
  return rowCount ?? 0;
}

// ── Login audit ─────────────────────────────────────────────────────────────

export interface LoginEvent {
  id: string;
  method: string;
  ip: string | null;
  userAgent: string | null;
  at: string;
}

export async function listLoginEvents(userId: string, limit = 25): Promise<LoginEvent[]> {
  const { rows } = await query<{
    id: string;
    method: string;
    ip: string | null;
    user_agent: string | null;
    created_at: Date;
  }>(
    `SELECT id, method, ip, user_agent, created_at
       FROM login_events
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((r) => ({
    id: r.id,
    method: r.method,
    ip: r.ip,
    userAgent: r.user_agent,
    at: r.created_at.toISOString(),
  }));
}

// ── Data export ─────────────────────────────────────────────────────────────

export type ExportDataset = "sales" | "inventory" | "customers";

export function isExportDataset(v: string): v is ExportDataset {
  return v === "sales" || v === "inventory" || v === "customers";
}

/** Returns `{ headers, rows }` for the requested dataset, tenant-fenced. */
export async function exportDataset(
  tenantId: string,
  dataset: ExportDataset,
): Promise<{ headers: string[]; rows: (string | number)[][] }> {
  if (dataset === "sales") {
    const { rows } = await query<{
      reference: string;
      created_at: Date;
      payment_method: string;
      total_cents: number;
      subtotal_cents: number;
      vat_cents: number;
      discount_cents: number;
    }>(
      `SELECT reference, created_at, payment_method, total_cents, subtotal_cents, vat_cents, discount_cents
         FROM sales WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId],
    );
    return {
      headers: ["Reference", "Date", "Payment", "Gross", "Net", "VAT", "Discount"],
      rows: rows.map((r) => [
        r.reference,
        r.created_at.toISOString(),
        r.payment_method,
        (r.total_cents / 100).toFixed(2),
        (r.subtotal_cents / 100).toFixed(2),
        (r.vat_cents / 100).toFixed(2),
        (r.discount_cents / 100).toFixed(2),
      ]),
    };
  }
  if (dataset === "inventory") {
    const { rows } = await query<{
      name: string;
      sku: string | null;
      price_cents: number;
      stock: number;
      low_stock_threshold: number;
      is_active: boolean;
    }>(
      `SELECT name, sku, price_cents, stock, low_stock_threshold, is_active
         FROM products WHERE tenant_id = $1 ORDER BY lower(name) ASC`,
      [tenantId],
    );
    return {
      headers: ["Name", "SKU", "Price", "Stock", "Low-stock threshold", "Active"],
      rows: rows.map((r) => [
        r.name,
        r.sku ?? "",
        (r.price_cents / 100).toFixed(2),
        r.stock,
        r.low_stock_threshold,
        r.is_active ? "Yes" : "No",
      ]),
    };
  }
  // customers
  const { rows } = await query<{
    name: string;
    phone: string | null;
    email: string | null;
    loyalty_points: number;
    created_at: Date;
  }>(
    `SELECT name, phone, email, loyalty_points, created_at
       FROM customers WHERE tenant_id = $1 ORDER BY lower(name) ASC`,
    [tenantId],
  );
  return {
    headers: ["Name", "Phone", "Email", "Loyalty points", "Since"],
    rows: rows.map((r) => [
      r.name,
      r.phone ?? "",
      r.email ?? "",
      r.loyalty_points,
      r.created_at.toISOString().slice(0, 10),
    ]),
  };
}

// ── Danger zone ─────────────────────────────────────────────────────────────

/** Suspend the store (reversible by a Super Admin) and revoke every session. */
export async function deactivateStore(tenantId: string): Promise<void> {
  await query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [tenantId]);
  await query(
    `UPDATE sessions SET revoked_at = now()
      WHERE tenant_id = $1 AND revoked_at IS NULL`,
    [tenantId],
  );
}
