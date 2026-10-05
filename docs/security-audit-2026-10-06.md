# VendoPOS — Security Audit Report

- **Date:** 2026-10-06
- **Commit audited:** `3b82e8a` (worktree clean at audit time)
- **Scope:** full source-first review of the backend API (`backend/src`, 144 TS
  files) plus the frontend's security-relevant surfaces.
- **Profile:** standard, run inline. **Execution policy:** static source analysis
  only — no target code executed (no OS-enforced sandbox available), so
  runtime-dependent items are marked *needs-validation* rather than exploited.
- **Prior ledger:** none. Treat this as a **first pass, not exhaustive.**

---

## Summary

The core trust boundaries are handled correctly and consistently — notably
better than typical for an app of this size:

- **No SQL injection surface.** Every query across all 20 modules is
  parameterized (`$1,$2`); zero string-interpolated SQL.
- **Tenant isolation is disciplined.** `tenantId` is always taken from the
  verified session (`req.user.tenantId` via `tenantOf(req)`), never from the
  request body/params. By-id repo calls filter `WHERE id=$1 AND tenant_id=$2`.
  The one client-supplied `tenantId` (admin compliance / impersonate) is on a
  `SUPER_ADMIN`-gated route and UUID-shape-checked.
- **POS checkout is server-priced.** The client sends only `{productId, qty}`;
  the server re-derives every peso and VAT figure from tenant-scoped `products`
  rows. Price tampering is not possible.
- **Auth is solid.** HS256 JWT with a random string secret (alg-confusion not
  reachable), issuer-checked; OAuth uses a signed + timestamped stateless CSRF
  `state`; passwords/PINs are scrypt + salt with `timingSafeEqual`; production
  enforces a ≥32-char `JWT_SECRET` at boot.
- **Rate limiting** on every credential endpoint (login/signup/PIN/forgot),
  per-IP, with a documented rationale against per-account lockout.
- **Admin/PII routes** are all `requireRole("SUPER_ADMIN")`.
- **Upload + XSS sinks are constrained.** Multer caps size + filters to
  `image/*`; `putMedia` whitelists extensions; SVGs served via the live path
  carry a `sandbox` CSP. All four `dangerouslySetInnerHTML` uses are either
  static JSON-LD (escaped) or theme CSS whose every value is hex-normalized /
  enum-checked / URL-scheme-gated on both client and server.
- **No secrets committed** (only `.env.example`); no hardcoded keys.

---

## Findings

### 1 — Database TLS certificate verification disabled · **Medium** · FIXED

**File:** `backend/src/db.ts`

The Neon connection was configured with `ssl: { rejectUnauthorized: false }`,
so the channel was encrypted but **not authenticated**. An attacker with a
network position on the host→Neon path (BGP/DNS hijack, compromised
intermediary) could present any certificate and transparently MITM the link —
reading and modifying all traffic: DB credentials, customer PII, sales,
password hashes.

- **Severity rationale:** precondition (active MITM between two managed cloud
  hosts) is uncommon, but the blast radius is the entire datastore.
- **Fix applied:** switched to `ssl: { rejectUnauthorized: true }`. Neon
  presents a publicly-trusted certificate, so Node's default trust store
  verifies it. **Validate** the connection still succeeds against Neon in
  staging before promoting to production.

### 2 — Legacy disk `/uploads` serves without the sandbox CSP · **Low · needs-validation**

**File:** `backend/src/app.ts` (the `express.static` fallback, ~L77-90)

The static-disk fallback sets `Cross-Origin-Resource-Policy: cross-origin` but
not the `Content-Security-Policy: …; sandbox` that `serveMedia`
(`media.store.ts`) applies. A stored SVG containing script, if served through
the disk fallback and opened directly on the API origin, could execute.

- **Why low / needs-validation:** new uploads go to Postgres (served by
  `serveMedia`, which *is* sandboxed), so the disk path only matters for
  pre-migration legacy files; impact further depends on whether the session
  cookie's domain is shared with the API origin in production.
- **Validate:** (a) whether any SVGs exist on the served disk, (b) the prod
  `COOKIE_DOMAIN`.
- **Smallest fix:** add the same
  `res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox")`
  in the `express.static` `setHeaders` callback, so both serving paths match.

### 3 — CSRF on body-less POSTs (e.g. `/auth/logout`) · **Low**

**File:** `backend/src/auth/auth.router.ts` (`POST /auth/logout`, ~L205)

With `SameSite=None` (required for the split frontend/API origins), the session
cookie rides on cross-site requests. Endpoints that require a JSON body are
protected — `express.json()` + the CORS-allowlisted preflight block a
cross-site forgery — but `/auth/logout` needs no body and no CSRF token, so a
cross-site page can force-log-out a user. Nuisance-level only.

- **Smallest fix:** require a custom header (e.g. `X-Requested-With`) on the
  mutation endpoints, or a double-submit CSRF token — primarily to close the
  body-less ones.

### 4 — Session revocation fails open during a DB outage · **Informational**

**File:** `backend/src/auth/auth.middleware.ts` (`sessionStillLive`, ~L73-81)

Returns `true` on a DB error so a transient outage doesn't lock everyone out.
The documented trade-off: a revoked / force-logged-out / impersonation-stopped
session stays valid for the outage window. Not independently exploitable (an
attacker can't cause the outage on demand). Noted so it's a conscious,
owner-known risk.

---

## Coverage & honest gaps

**Reviewed in depth:** app bootstrap, auth (JWT/OAuth/password/PIN/
impersonation), middleware/role guards, DB layer, POS checkout + refunds/
shifts, media upload/serve, leads, public, admin authz, the theme-config
injection path, and a frontend sweep for XSS sinks / committed secrets.

**Not covered this pass** (reasonable next targets): per-module repositories
individually (HR/finance/procurement/manufacturing/CRM — spot-checked only for
the tenant-scope pattern), the SSE health/notification streams, the Vercel
frontend proxy/rewrite config and its cookie handling, dependency CVEs, and any
runtime validation of findings 2–4.

---

## Method

This review followed the Cloudflare `security-audit` skill's source-first
discipline: every finding names a concrete trust boundary, lower-trust actor,
crossed control, and observable result; only confirmed findings carry a
severity; and fixes are the smallest change that enforces the missing invariant
at the last trusted decision point. No target code was executed.
