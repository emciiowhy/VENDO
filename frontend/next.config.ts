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
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: `${API_TARGET}/api/:path*` },
        { source: "/auth/:path*", destination: `${API_TARGET}/auth/:path*` },
        { source: "/uploads/:path*", destination: `${API_TARGET}/uploads/:path*` },
      ],
    };
  },
};

export default nextConfig;
