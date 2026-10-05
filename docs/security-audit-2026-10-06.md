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

### 3 — CSRF on body-less POSTs (e.g. `/auth/logout`) · **Low** · FIXED

**Files:** `backend/src/auth/csrf.ts` (new), `backend/src/app.ts`

With `SameSite=None` (required for the split frontend/API origins), the session
cookie rides on cross-site requests. Endpoints that require a JSON body are
protected — `express.json()` + the CORS-allowlisted preflight block a
cross-site forgery — but `/auth/logout` needs no body and no CSRF token, so a
cross-site page could force-log-out a user.

- **Fix applied:** added an Origin-based CSRF guard (`csrfOriginGuard`) mounted
  before all routes. Every mutating method (POST/PUT/PATCH/DELETE) must carry an
  `Origin` — or a `Referer` fallback — that matches the same allowlist CORS
  already trusts; a forged cross-site write carries the attacker's origin and is
  rejected with 403. Read-only verbs pass through. It fails open only when
  *neither* header is present (never a browser-driven CSRF). Chosen over a
  client-side CSRF-token/header scheme because it needs **zero** frontend
  changes — the 126 `lib/` fetch sites are untouched — so it can't regress any
  call site. Covered by `backend/src/auth/csrf.test.ts` (5 tests).
- **Validate:** confirm the Vercel same-origin proxy forwards the browser
  `Origin`/`Referer` to the API in production (Next rewrites forward request
  headers by default); if both were stripped the guard fails open, i.e. no
  worse than before.

### 5 — App HTML has no anti-framing header (clickjacking) · **Low** · FIXED

**File:** `frontend/next.config.ts`

The backend's `helmet()` hardens API (JSON) responses, but the dashboard HTML
is served by Vercel/Next, which set no `X-Frame-Options` / `frame-ancestors`.
Because the session cookie is `SameSite=None` (required for the split origins),
it is sent inside a cross-origin iframe — so an attacker page could frame the
authenticated dashboard and clickjack a logged-in owner into single-click state
changes (store deactivate, void a sale) that bypass the client-side confirm
modals.

- **Severity rationale:** reachable but interaction-dependent (victim must visit
  the attacker page while logged in, and the overlay must align with a specific
  control) — it weakens rather than fully defeats a control.
- **Fix applied:** added a `headers()` block setting `X-Frame-Options:
  SAMEORIGIN`, CSP `frame-ancestors 'self'`, `X-Content-Type-Options: nosniff`,
  and a referrer policy across all app routes.

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

**Second pass (deeper review) — now also covered:**

- **All module repositories** swept for by-id mutations missing the tenant
  filter. Every `UPDATE`/`DELETE` is scoped by `tenant_id` (or by session
  `user_id` for self-owned rows). The dynamic `SET ${sets.join(",")}` builders
  (products/finance/procurement/manufacturing/staff/adminTenants) use
  **hardcoded** column-name literals with parameterized values — no column
  injection — and all carry `WHERE … tenant_id`. `manufacturing.updateRecipe`
  does an unscoped `DELETE … WHERE recipe_id=$1`, but it is gated by a prior
  tenant-scoped `getRecipe` ownership check, so it is not cross-tenant
  reachable. Staff user/PIN writes are additionally `role='CASHIER'` fenced.
- **Both SSE streams.** `/admin/health/stream` is `SUPER_ADMIN`-gated;
  `/merchant/events/stream` is `MERCHANT_OWNER|MANAGER`-gated and tenant-scoped
  (`getLowStockCrossingsSince(tenantId, …)`). Both `clearInterval` on `close`.
- **Vercel/Next proxy** (`next.config.ts`): rewrite destination is a fixed env
  origin with only the path varying — no open-proxy/SSRF. All `NEXT_PUBLIC_*`
  vars are non-secret (API/app/booking URLs, Google site verification).

**Dependency posture (scanned):** `npm audit --omit=dev` reports **0
vulnerabilities** for both backend and frontend — i.e. zero production-runtime
CVEs reachable by an attacker. The advisories that *do* appear are confined to
build/test/lint tooling that never runs in production:

- Backend (dev): 5 (1 critical, 1 high, 3 moderate) in `vitest → vite →
  esbuild` (test runner).
- Frontend (dev): 5 high in `eslint-config-next → fast-glob → micromatch →
  braces` (lint config; `braces` stack-exhaustion ReDoS, build-time only).

None process attacker-controlled input across a trust boundary in the deployed
app, so none are findings. **Do NOT run `npm audit fix --force`:** on the
frontend it would install `eslint-config-next@14.2.35`, a downgrade that breaks
the Next 16 project. These clear when the upstream dev tools bump their
transitive globbing/esbuild deps; low urgency.

**Still not covered** (reasonable next targets): the notification/email
producers end to end, and runtime validation of findings 1–3.

---

## Method

This review followed the Cloudflare `security-audit` skill's source-first
discipline: every finding names a concrete trust boundary, lower-trust actor,
crossed control, and observable result; only confirmed findings carry a
severity; and fixes are the smallest change that enforces the missing invariant
at the last trusted decision point. No target code was executed.
