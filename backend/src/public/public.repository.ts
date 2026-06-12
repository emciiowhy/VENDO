import { query } from "../db.js";

/**
 * Public, unauthenticated read used by the marketing site's "Trusted by"
 * marquee. The projection is deliberately minimal — only a store's id, display
 * name and (public) logo ever leave this query. The logo is already shown
 * publicly on receipts and the customer display, so it is safe here; nothing
 * operational (plan/tier, status detail, owner identity, credentials, emails,
 * revenue or staff counts) is selected, so there is no path for sensitive data
 * to leak into the public JSON. Runs through the shared pooled `query()` helper
 * (no manual client checkout → no connection-leak surface).
 */
export interface PublicTenant {
  id: string;
  businessName: string;
  initials: string;
  /** Public store logo URL, or null when the owner hasn't uploaded one. */
  logoUrl: string | null;
}

/** Up-to-two-letter uppercase monogram derived from the store's display name. */
function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * The 12 most recently provisioned ACTIVE stores, newest first — the live brand
 * roster behind the landing-page belt. `business_name`/`initials` aren't stored
 * columns; we select the public-safe `name` and derive both, keeping the SQL
 * surface to exactly what the public payload needs.
 */
export async function listPublicTenants(): Promise<PublicTenant[]> {
  const { rows } = await query<{ id: string; name: string; logo_url: string | null }>(
    `SELECT id, name, logo_url
       FROM tenants
      WHERE status = 'active'
      ORDER BY created_at DESC
      LIMIT 12`,
  );
  return rows.map((r) => ({
    id: r.id,
    businessName: r.name,
    initials: deriveInitials(r.name),
    logoUrl: r.logo_url,
  }));
}
