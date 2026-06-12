# VendoPOS

A multi-tenant POS + ERP platform built for the Philippines. This repo currently implements
**PRD 0001 — the marketing landing page** with its one real seam: **Lead capture**
(`POST /api/leads`). See [`docs/prd/0001-vendopos-landing-page.md`](docs/prd/0001-vendopos-landing-page.md)
and the domain vocabulary in [`CONTEXT.md`](CONTEXT.md).

> A **Lead** is a visitor who submitted the "Request a Demo" form but is not yet a **Tenant**.
> There is no self-serve sign-up — the Super Admin onboards each Lead manually.

## Stack

| Layer    | Tech                                            | Folder      |
| -------- | ----------------------------------------------- | ----------- |
| Frontend | Next.js 16 (App Router) + Tailwind CSS v4       | `frontend/` |
| Backend  | Express + TypeScript (`pg`, `zod`)              | `backend/`  |
| Database | NeonDB (serverless Postgres)                    | —           |

```
Visitor → demo form (frontend) → POST /api/leads (backend) → leads table (NeonDB)
```

The `prototype/` folder holds the original static HTML concept proof; the real app supersedes it.

## Prerequisites

- Node.js 20+ (built with v22)
- A free NeonDB project → https://console.neon.tech

## 1. Database (NeonDB)

1. Create a project at https://console.neon.tech.
2. Copy the **connection string** (Connection Details → "Connection string"). It looks like:
   ```
   postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env          # then paste your Neon URL into DATABASE_URL
npm run migrate               # creates the `leads` table (idempotent)
npm run dev                   # starts http://localhost:4000
```

Endpoints:

- `GET  /health` — liveness check.
- `POST /api/leads` — validates a Lead payload `{ name, businessName, email, phone, businessType, message? }`,
  persists it, returns `{ ok: true, lead }`. Invalid payloads return `400 { ok: false, errors }`
  and persist nothing.
- `GET  /api/leads` — recent Leads (placeholder for a future Super Admin view; **no auth yet**).
- `GET  /auth/google` — starts direct Google OAuth: mints a CSRF `state`, redirects to the Google
  consent screen. (Plain top-level navigation — the "Sign in with Google" button links straight here.)
- `GET  /auth/google/callback` — Google returns here; the backend verifies `state`, exchanges the
  code, looks the email up in `users`, signs the application JWT, sets a secure HTTP-only cookie, and
  redirects to the role's dashboard (`/admin`, `/dashboard`, or `/pos`). Unknown emails are turned
  away with `?error=not_provisioned` — there is no self-serve sign-up.
- `GET  /auth/me` — the current session (`{ userId, tenantId, role, email, name, tenantName }`) or `401`.
  `tenantName` is looked up live from the DB so the dashboards show the real store name (no re-login needed after a rename; null for SUPER_ADMIN).
- `POST /auth/logout` — clears the session cookie.
- `POST /auth/store` — resolve a **Store ID** (the tenant `slug`) to `{ id, name, slug }`, or `404`.
  Public and unauthenticated (the slug isn't a secret); lets a cashier identify their store on a
  cold terminal before the PIN check.
- `POST /auth/pin` — shared-terminal cashier switch. Verifies a 4-digit PIN **within one Tenant** and
  swaps the cookie to the cashier's session. The Tenant comes from an active session if one exists
  (warm terminal); otherwise from a `storeId` in the body (cold login terminal). An active session
  always wins, so a typed Store ID can never reach across Tenants.

**Inventory & categories** (`/api/inventory/*`) — fenced to `MERCHANT_OWNER` / `MANAGER`; the Tenant
scope is read from the session cookie, never the request body, and threaded into every query.

- `GET    /api/inventory/products` — the signed-in store's products (with category name + a derived
  `lowStock` flag).
- `POST   /api/inventory/products` — create (multipart). Optional `image` file (`image/*`, ≤2MB) is
  streamed to storage; only its public URL is persisted in `image_url`. `price` is in pesos and
  stored as integer centavos.
- `PATCH  /api/inventory/products/:id` — partial update; send a new `image`, or `removeImage=true`
  to clear it.
- `DELETE /api/inventory/products/:id` — delete (also removes the stored image).
- `GET/POST/PATCH/DELETE /api/inventory/categories[/:id]` — nested categories (self-referential
  `parent_id`). Deleting a category falls its products back to uncategorised.

Uploaded product images are served from **`GET /uploads/products/:file`** by the default local-disk
storage provider, with `Cross-Origin-Resource-Policy: cross-origin` so the Next.js frontend on a
different origin can render them in `<img>` tags (helmet otherwise defaults this to `same-origin`).
Swapping in a cloud bucket (Supabase/S3/Cloudinary) only touches `products.storage.ts` — the
contract (Buffer + contentType → public URL) is unchanged.

**Leads pipeline & tenant provisioning** (`/api/v1/admin/leads/*`) — fenced to `SUPER_ADMIN`. The
landing-page `leads` table is reused (extended with a `status` enum + unique email); the demo form
keeps writing to it (now an upsert on email).

- `GET  /api/v1/admin/leads` — the whole pipeline (`PENDING_DEMO` / `APPROVED` / `REJECTED`).
- `POST /api/v1/admin/leads/:id/approve` — **atomic** lead → tenant promotion in one transaction:
  checks slug + owner-email collisions, inserts the `tenants` row, inserts the owner into `users` as
  `MERCHANT_OWNER`, and flips the lead to `APPROVED` — all-or-nothing (a collision rolls back with a
  clean `409`, leaving nothing half-created). Body: `{ storeName, slug, plan, ownerEmail, ownerName }`.
- `POST /api/v1/admin/leads/:id/reject` — decline a pending lead.

**POS register** (`/api/v1/pos/*`) — fenced to `CASHIER` / `MERCHANT_OWNER` / `MANAGER`, tenant-scoped
from the session. Money is integer centavos throughout.

- `GET  /api/v1/pos/catalog` — the live register feed for the signed-in store: store name, categories,
  and **active** products (with `priceCents`, `stock`, `lowStockThreshold`, `imageUrl`).
- `GET  /api/v1/pos/cashiers` — active cashier profiles (`{ id, name }`) for the terminal switch
  selector (names only; PIN hashes never leave the DB).
- `POST /api/v1/pos/orders` — **ACID checkout** in one transaction. The client sends only
  `{ items:[{ productId, qty }], paymentMethod, tenderedCents?, referenceCode?, discount? }` — the
  server re-derives all prices from the DB. It locks each product row (`FOR UPDATE`), aborts with
  `400` (+ `productId`/`available`) if any line lacks stock, applies the cart `discount`
  (`{ type:'percent'|'fixed', value, label? }` — percent 0–100, fixed in centavos) server-side,
  decrements `stock`, computes the 12%-inclusive VAT on the **net**, and writes a `sales` header
  (BIR-style `SI-` reference, settlement channel, cash/change, e-wallet `payment_ref`, discount) plus
  `sale_items` snapshots — all-or-nothing.

The cashier switch (`POST /auth/pin`) optionally takes a `userId` (the profile picked in the selector)
so a colliding PIN can't switch into the wrong cashier.

**Forgot-PIN (cashier) + PIN administration (owner).** Cashiers never set their own PIN — a forgotten
PIN raises a request the store owner resolves.

- `POST /auth/cashiers` — public: a store's active cashier profiles (`{ id, name }`) for the forgot-PIN
  picker. Tenant resolved the same way as `POST /auth/pin` (active session wins, else `storeId`).
- `POST /auth/pin/forgot` — public: `{ cashierId, storeId? }` raises a pending reset request (idempotent;
  a second while one is pending is a no-op). One pending request per cashier (partial unique index).
- `GET  /api/v1/staff/cashiers` — **OWNER only**: cashier roster (PIN set? pending request?) + the pending
  requests list.
- `POST /api/v1/staff/cashiers/:id/pin` — **OWNER only**: set/replace a cashier's 4-digit PIN; resolves any
  pending request for that cashier in the same transaction.
- `POST /api/v1/staff/pin-requests/:id/reject` — **OWNER only**: dismiss a pending request.

The cashier checkout also renders a **scan-to-pay QR** for e-wallet rails (GCash/Maya/QRPH) right on the
pad (mirrored on the customer display). All sign-out / terminal-lock actions now go through a confirm
dialog, and the authenticated loaders carry the stored theme so dark-mode users don't get a white flash.

**Cashier shift reconciliation** (`/api/v1/pos/shifts/*`) — the X-Read / Z-Read drawer ledger, fenced
to till staff and keyed to the operator (one open shift per cashier per Tenant, enforced by a partial
unique index). Sales are stamped with their `shift_id`, so tallies derive from real transactions.

- `GET  /api/v1/pos/shifts/active` — the caller's open shift with **live running tallies** (cash /
  e-wallet / card revenue, txn count, and the expected drawer cash = opening float + cash sales), or
  `null`.
- `POST /api/v1/pos/shifts/open` — open a shift recording the **opening cash drawer balance**
  (`{ openingCents }`). `409` if one is already open.
- `POST /api/v1/pos/shifts/close` — the **Z-Read**: in one transaction it locks the shift, snapshots the
  per-channel rollups from the stamped sales, computes the cash **variance to the centavo**
  (`counted − expected`; + overage / − shortage), and freezes an immutable `cashier_shifts` audit row.
  Body `{ countedCents, note? }`.

The register also drives a **Customer-Facing Display** at `/pos/customer-display` — a clean, high-contrast
second screen mirroring the live cart. Sync is purely client-side over a same-origin `BroadcastChannel`
(no server round-trip), so it's inherently isolated to the active terminal/browser. Selecting an e-wallet
rail (GCash/Maya/QRPH) on the cashier pad animates a QR presentation sheet open on the customer screen.

**Super Admin billing & MRR** (`/api/v1/admin/analytics/*`) — fenced to `SUPER_ADMIN`; platform-wide
(not tenant-scoped, since the operator sits above every Tenant).

- `GET /api/v1/admin/analytics/billing` — the MRR engine: Monthly Recurring Revenue (summed from each
  active Tenant's plan price), active-subscriber count, blended ARPA, annual run rate, a per-tier
  breakdown, a six-month transaction-fee trend, and a six-month cumulative **MRR growth curve** (from
  tenant onboarding dates). Plan prices + limits live in `billing/plans.ts`. The `/admin/billing` view
  renders these with **Recharts** (MRR line, plan-distribution donut, fee bar) themed for Light/Dark.
- `GET /api/v1/admin/analytics/subscribers` — the live subscriber register (store name, owner contact,
  plan, onboarding date, status) behind the "Active Subscribers" drill-down drawer.

The merchant layer enforces the plan's **product capacity** as a guardrail: `POST /api/inventory/products`
returns a clean `403 { code:"plan_limit_exceeded" }` once a Starter/Business Tenant hits its catalog cap
(Enterprise is unlimited).

**Super Admin system health** (`/api/v1/admin/health/*`) — fenced to `SUPER_ADMIN`.

- `GET /api/v1/admin/health/stream` — a Server-Sent Events stream. Pushes `metrics` events (live NeonDB
  pool occupancy + a freshly-measured query round-trip latency) every few seconds, `activity` events
  (a cross-tenant ticker unioned from new sales and product creations) as they happen, and `alert`
  events — **shift-variance security flags** raised the moment a Z-Read closes with an un-reconciled
  drawer overage/shortage (surfaced as a flag card + toast on the System Health overview).

**Merchant analytics & BIR compliance** (`/api/v1/merchant/*`, `/api/v1/inventory/alerts`) — fenced to
`MERCHANT_OWNER` / `MANAGER`, tenant-scoped from the session. "Today" and monthly buckets are evaluated
in Manila time so figures line up with the local retail day.

- `GET /api/v1/merchant/analytics/dashboard` — the live "Pulse": today's gross, transaction count, AOV,
  units sold, net/VAT/discount totals, hourly revenue velocity, payment-channel mix and best sellers —
  all `SUM`/`COUNT` over `sales`/`sale_items` (no mock data).
- `GET /api/v1/inventory/alerts` — the low-stock engine: active products at/below their
  `low_stock_threshold`, most-urgent first (also mounted at `/api/v1/merchant/inventory/alerts`).
- `GET /api/v1/merchant/events/stream` — the merchant real-time alert feed (SSE). Pushes a `low-stock`
  event the moment a sale drops a product to/below its threshold, which the dashboard turns into a
  warning toast (and live-merges into the low-stock panel).
- `GET /api/v1/merchant/compliance/export?month=YYYY-MM` — the BIR sales ledger for one calendar month:
  serialized invoices with gross (VAT-inclusive), net taxable, 12% output VAT, discounts and the
  e-wallet reference. Returns JSON for the on-screen audit tray, or a tax-prep **CSV** with `&format=csv`.

Every committed receipt now gets an **immutable, gap-free, chronological** invoice serial (`SI-000123`)
from a per-Tenant `invoice_counters` row that the checkout transaction locks — replacing the old
`count(*)+1` sequence that two simultaneous tills could collide on.

Run the behaviour tests (no database required — they exercise the validation seam):

```bash
npm test
```

## 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local    # defaults to http://localhost:4000 — fine for local dev
npm run dev                   # starts http://localhost:3000
```

Open http://localhost:3000 and submit the demo form. A valid submission is written to the
`leads` table in Neon; you can confirm with `GET http://localhost:4000/api/leads` or the Neon SQL editor.

## Environment variables

**backend/.env**

| Var            | Example                                  | Notes                              |
| -------------- | ---------------------------------------- | ---------------------------------- |
| `DATABASE_URL` | `postgresql://…neon.tech/neondb?sslmode=require` | Required. From Neon.       |
| `PORT`         | `4000`                                   | API port.                          |
| `CORS_ORIGIN`  | `http://localhost:3000`                  | Comma-separated allowed origins.   |
| `FRONTEND_URL` | `http://localhost:3000`                  | Where the backend redirects after login. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from Google Cloud Console | OAuth web client. Blank = sign-in disabled. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/auth/google/callback` | Must be listed in the OAuth client. |
| `JWT_SECRET`   | long random string                       | Signs the application JWT. Required for sign-in. |
| `SESSION_COOKIE_NAME` / `COOKIE_DOMAIN` | `vendopos_session` / _(blank)_ | Set `COOKIE_DOMAIN` (e.g. `.vendopos.com`) only on split subdomains. |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Origin used to build product-image URLs (the `/uploads` static host). |

**frontend/.env.local**

| Var                   | Example                 | Notes                          |
| --------------------- | ----------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL of the Express API.   |

## Authentication (Google OAuth + cashier PIN)

The frontend exposes one sign-in page at **`/login`** (a split layout — brand rail + form): a
"Continue with Google" button (linking to `/auth/google`) for Merchant owners/managers and the
Super Admin, plus a **Store ID → PIN** path for cashiers on shared shop-floor terminals (type the
Store ID to scope the tenant, then a 4-digit PIN). There's no self-serve sign-up — the Super Admin
provisions `tenants` and `users` rows manually, so to actually log in you must first insert an
account whose email matches your Google login, e.g.:

```sql
-- A platform Super Admin (no Tenant):
INSERT INTO users (email, name, role) VALUES ('you@gmail.com', 'You', 'SUPER_ADMIN');

-- A Merchant owner inside a Tenant:
INSERT INTO tenants (name, slug, plan) VALUES ('Kape ni Juan', 'kape-ni-juan', 'starter');
INSERT INTO users (tenant_id, email, name, role)
VALUES ((SELECT id FROM tenants WHERE slug = 'kape-ni-juan'), 'owner@kapenijuan.ph', 'Juan dela Cruz', 'MERCHANT_OWNER');
```

To enable Google sign-in, create an OAuth web client in the Google Cloud Console, add
`http://localhost:4000/auth/google/callback` to its authorized redirect URIs, and fill
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `JWT_SECRET` in `backend/.env`. With those blank,
the API still boots and `/auth/google` redirects to `/login?error=auth_unconfigured`.

## Not yet built (deferred per PRD 0001)

- Self-serve sign-up and automatic Tenant provisioning (Path A); payment collection / invoicing for the
  computed MRR (the billing engine reports it, but doesn't charge cards yet).
- The remaining ERP Modules' real functionality (Procurement, Manufacturing, Finance, HR, CRM).
- Super Admin notification on new Lead (first cut persists to Neon only).
- Tenant isolation strategy — the first backend ADR to write.
