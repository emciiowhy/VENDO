import type { NextConfig } from "next";

/**
 * Same-origin API proxy.
 *
 * The frontend (vendopos.shop) and the API (Render) are different origins, which
 * makes the session cookie cross-origin — browsers refuse to store/send it, so
 * logins bounce. Reverse-proxy the API's paths through the frontend's own origin
 * so the cookie is plain first-party. `API_PROXY_TARGET` is the backend origin
 * (defaults to production); set it per-environment if needed.
 *
 * NOTE: nothing under /api, /auth, or /uploads may be a frontend route — the
 * self-service signup page lives at /signup (not /auth/signup) for this reason.
 */
const API_TARGET = process.env.API_PROXY_TARGET ?? "https://api.vendopos.shop";

const nextConfig: NextConfig = {
  /**
   * Procurement and Manufacturing are retired from VendoPOS (their APIs are no
   * longer mounted). Old bookmarks land somewhere useful instead of a dead
   * console. Temporary (307) so re-enabling a module later isn't fighting a
   * browser-cached permanent redirect. Restocking now lives in Product
   * Management, so the old Procurement links go there.
   */
  async redirects() {
    return [
      { source: "/dashboard/procurement", destination: "/dashboard/inventory", permanent: false },
      { source: "/dashboard/manufacturing", destination: "/dashboard", permanent: false },
      { source: "/products/procurement", destination: "/products", permanent: false },
      { source: "/products/manufacturing", destination: "/products", permanent: false },
      // VendoPOS is not BIR-accredited, so the old "BIR Accreditation" page is gone.
      { source: "/products/bir-accreditation", destination: "/products", permanent: false },
    ];
  },

  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
        { source: "/auth/:path*", destination: `${API_TARGET}/auth/:path*` },
        { source: "/uploads/:path*", destination: `${API_TARGET}/uploads/:path*` },
      ],
    };
  },

  /**
   * Security headers for the app's own HTML (the API, served by Render, is
   * hardened separately by helmet). Chiefly anti-clickjacking: the session
   * cookie is SameSite=None so it rides inside a cross-origin iframe, which
   * would otherwise let an attacker frame the dashboard and trick a logged-in
   * owner into single-click state changes (deactivate store, void a sale).
   * `frame-ancestors 'self'` (plus the legacy X-Frame-Options) forbids any
   * cross-origin framing while still allowing same-origin embeds. nosniff
   * blocks MIME-type confusion. Referrer policy trims cross-origin leakage.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
