/**
 * Server-side data source for the landing-page "Trusted by" marquee. Fetches the
 * live public tenant roster (`GET /api/v1/public/tenants`) during the SSR pass
 * with a 10-minute edge-cache TTL, and merges it behind our flagship anchor
 * brands. If the API is unreachable, the flagship array is returned alone so the
 * belt is never empty — the marquee degrades gracefully and the page still
 * renders. No client-side fetching: this is awaited by the server component.
 */
import { API_BASE_URL } from "./api";

/** Edge-cache revalidation window for the roster (seconds). */
export const TRUSTED_BRANDS_REVALIDATE = 600; // 10 minutes

export interface Brand {
  name: string;
  /** Monogram shown in the wordmark frame when there's no uploaded logo. */
  mark: string;
  /** Public store logo URL; when present the marquee renders it over the monogram. */
  logoUrl?: string | null;
}

/** Flagship anchor brands the marquee always leads with (the fail-safe). */
const FLAGSHIP_BRANDS: Brand[] = [
  { name: "McoyProd Eats", mark: "Mc" },
  { name: "Local Coffee Co.", mark: "LC" },
  { name: "TeaModern Pastries", mark: "TM" },
  { name: "CHEEZY CAFE", mark: "CC" },
  { name: "Brew & Bloom", mark: "BB" },
];

interface PublicTenant {
  id: string;
  businessName: string;
  initials: string;
  logoUrl: string | null;
}

/**
 * Flagship anchors first, then live tenant records, de-duped by name. A live
 * record OVERRIDES a same-named flagship placeholder (case-insensitive) so a
 * real store that uploaded a logo surfaces it instead of the hard-coded
 * monogram — while order (flagships first, then newest live stores) is kept.
 */
export async function getTrustedBrands(): Promise<Brand[]> {
  let dynamic: Brand[] = [];
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/public/tenants`, {
      next: { revalidate: TRUSTED_BRANDS_REVALIDATE },
    });
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; tenants?: PublicTenant[] };
      if (data.ok && Array.isArray(data.tenants)) {
        dynamic = data.tenants.map((t) => ({
          name: t.businessName,
          mark: t.initials,
          logoUrl: t.logoUrl,
        }));
      }
    }
  } catch {
    // API unreachable during SSR — fall through to the flagship anchors alone.
  }

  // Insertion-ordered map: flagships seed the order, live records with the same
  // name replace the placeholder in place (carrying the real logo); brand-new
  // live stores append after.
  const byName = new Map<string, Brand>();
  for (const b of FLAGSHIP_BRANDS) byName.set(b.name.toLowerCase(), b);
  for (const b of dynamic) byName.set(b.name.toLowerCase(), b);
  return [...byName.values()];
}
