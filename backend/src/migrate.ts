import { pool } from "./db.js";

/**
 * Creates the `leads` table if it does not exist. Idempotent — safe to run
 * repeatedly. Run with: `npm run migrate`.
 *
 * `gen_random_uuid()` comes from the built-in pgcrypto functions available on
 * Neon Postgres; we enable the extension defensively just in case.
 */
const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  business_name TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  phone         TEXT        NOT NULL,
  business_type TEXT        NOT NULL,
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

-- ---------------------------------------------------------------------------
-- Auth / tenancy (PRD: backend Google OAuth + multi-tenant token mapping)
--
-- A Tenant is the isolated data boundary belonging to one Merchant. A user is
-- an account that may sign in: the platform-wide SUPER_ADMIN (tenant_id NULL),
-- or a MERCHANT_OWNER / MANAGER / CASHIER scoped to exactly one Tenant.
-- There is no self-serve sign-up — the Super Admin provisions these rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE,
  plan        TEXT        NOT NULL DEFAULT 'starter'
                          CHECK (plan IN ('starter', 'business', 'enterprise')),
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants (id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL
                            CHECK (role IN ('SUPER_ADMIN', 'MERCHANT_OWNER', 'MANAGER', 'CASHIER')),
  google_sub    TEXT,                     -- Google subject id, stamped on first login
  pin_hash      TEXT,                     -- scrypt hash for shared-terminal CASHIER PINs
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'disabled')),
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- SUPER_ADMIN has no tenant; everyone else must belong to one.
  CHECK ((role = 'SUPER_ADMIN') = (tenant_id IS NULL))
);

-- Email is the Google identity key — unique per account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

-- Per-cashier default opening cash float (centavos). The owner sets a standard
-- drawer baseline per cashier; the POS "Open shift" gate pre-fills it so the
-- float isn't re-typed every shift. 0 means "no default — cashier keys it in".
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_float_cents INTEGER NOT NULL DEFAULT 0
  CHECK (default_float_cents >= 0);

-- Optional password for OWNER/MANAGER sign-in (scrypt hash). Self-service: an
-- owner/manager signs in with Google first, then sets a password from the
-- dashboard so they can later sign in with Store ID + email + password. NULL =
-- no password set (Google only). Cashiers use pin_hash; this is never set for them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ---------------------------------------------------------------------------
-- Inventory: categories + products (Merchant Inventory & Category CRUD Matrix)
--
-- Both are owned by exactly one Tenant; every query is scoped by tenant_id so
-- one Merchant can never see or touch another's catalog. Categories nest via a
-- self-referential parent_id (localized grouping, e.g. Beverages → Espresso).
-- Money is stored as integer centavos to avoid float drift. Product images are
-- never stored as buffers — only a public URL string in image_url.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES categories (id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_tenant_idx ON categories (tenant_id);
-- Category names are unique within a Tenant (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_name_key
  ON categories (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  category_id          UUID REFERENCES categories (id) ON DELETE SET NULL,
  name                 TEXT        NOT NULL,
  sku                  TEXT,
  price_cents          INTEGER     NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  stock                INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_threshold  INTEGER     NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  image_url            TEXT,                 -- public asset link; never a raw buffer
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_tenant_idx ON products (tenant_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);
-- SKUs are unique within a Tenant when present.
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_key
  ON products (tenant_id, lower(sku)) WHERE sku IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Leads pipeline (Super Admin Leads Management & Tenant Provisioning).
--
-- Reuses the existing landing-page \`leads\` table rather than a parallel one:
-- the demo form already captures business_name / name (contact) / email / phone
-- / created_at. We add a provisioning \`status\` and make the email unique so a
-- lead is a single pipeline row. On approval the row maps into \`tenants\` +
-- \`users\` (see admin/adminLeads.repository.ts).
-- ---------------------------------------------------------------------------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING_DEMO';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_status_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_status_check
      CHECK (status IN ('PENDING_DEMO', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

-- One pipeline row per email (case-insensitive); the landing insert upserts.
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_key ON leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);

-- ---------------------------------------------------------------------------
-- Sales ledger (POS checkout). A \`sales\` header carries the BIR-style invoice
-- reference, VAT breakdown (12% inclusive), settlement channel and (for cash)
-- the tendered/change; \`sale_items\` snapshots each line so a later product edit
-- or deletion never rewrites history. Money is integer centavos throughout.
-- Every checkout is written inside one transaction that also decrements stock.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  cashier_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  reference       TEXT        NOT NULL,            -- BIR serial, e.g. SI-000123
  subtotal_cents  INTEGER     NOT NULL CHECK (subtotal_cents >= 0),
  vat_cents       INTEGER     NOT NULL CHECK (vat_cents >= 0),
  total_cents     INTEGER     NOT NULL CHECK (total_cents >= 0),
  payment_method  TEXT        NOT NULL CHECK (payment_method IN ('Cash', 'GCash', 'Maya', 'QRPH')),
  tendered_cents  INTEGER,                         -- cash only
  change_cents    INTEGER,                         -- cash only
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_tenant_idx ON sales (tenant_id, created_at DESC);
-- Invoice reference is unique within a Tenant (a backstop for the serializer).
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_reference_key ON sales (tenant_id, lower(reference));

CREATE TABLE IF NOT EXISTS sale_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id          UUID NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products (id) ON DELETE SET NULL,
  name             TEXT        NOT NULL,           -- snapshot at time of sale
  unit_price_cents INTEGER     NOT NULL,
  qty              INTEGER     NOT NULL CHECK (qty > 0),
  line_total_cents INTEGER     NOT NULL
);

CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items (sale_id);

-- Checkout utilities: e-wallet reference (last digits) + cart-level discount.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_ref    TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_label TEXT;

-- ---------------------------------------------------------------------------
-- BIR invoice serialization (official receipt numbering).
--
-- Replaces the old count(*)+1 sequence (which two simultaneous tills could
-- collide on) with a per-Tenant monotonic counter. The checkout transaction
-- bumps it via INSERT … ON CONFLICT DO UPDATE … RETURNING, which locks the
-- counter row for the duration — so every committed receipt gets an immutable,
-- gap-free, chronological invoice number unique to its Tenant, even under
-- concurrent registers. Seeded from the Tenant's existing sales count on first
-- use so numbering continues unbroken for stores that already have history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_counters (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  next_seq   BIGINT      NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Cashier shift reconciliation ledger (X-Read / Z-Read).
--
-- One row per till session. Opening: the cashier records the baseline change
-- in the drawer (opening_cents). During the shift, sales are stamped with
-- shift_id (see sales.shift_id) so expected balances are derived from real
-- transactions, per channel. Closing (Z-Read): the operator keys the PHYSICAL
-- cash count; the system snapshots the channel rollups, computes the cash
-- variance (counted − expected) to the centavo, and freezes the row as an
-- immutable audit record. All money is integer centavos. Strictly tenant-fenced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  cashier_user_id            UUID REFERENCES users (id) ON DELETE SET NULL,
  cashier_name               TEXT        NOT NULL,            -- snapshot at open
  status                     TEXT        NOT NULL DEFAULT 'open'
                                         CHECK (status IN ('open', 'closed')),
  opening_cents              INTEGER     NOT NULL DEFAULT 0 CHECK (opening_cents >= 0),
  -- Channel rollups + reconciliation, snapshotted at Z-Read (null while open).
  cash_sales_cents           INTEGER,
  ewallet_sales_cents        INTEGER,                         -- GCash + Maya
  card_sales_cents           INTEGER,                         -- QRPH rail
  total_sales_cents          INTEGER,
  txn_count                  INTEGER,
  expected_cash_cents        INTEGER,                         -- opening + cash sales
  counted_cash_cents         INTEGER,                         -- physical drawer count
  cash_variance_cents        INTEGER,                         -- counted − expected
  note                       TEXT,
  opened_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cashier_shifts_tenant_idx ON cashier_shifts (tenant_id, opened_at DESC);
-- A cashier may hold at most ONE open shift at a time within their Tenant.
CREATE UNIQUE INDEX IF NOT EXISTS cashier_shifts_one_open_per_user
  ON cashier_shifts (tenant_id, cashier_user_id) WHERE status = 'open';
-- Immutable, human-readable Z-Read reconciliation line (expected vs. counted to
-- the centavo) frozen at close for owner review. Added post-hoc, hence ALTER.
ALTER TABLE cashier_shifts ADD COLUMN IF NOT EXISTS audit_snapshot TEXT;

-- Attribute each sale to the shift it rang up in, so X/Z-Read tallies derive
-- from real transactions rather than a wall-clock window.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cashier_shifts (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_shift_idx ON sales (shift_id);

-- ---------------------------------------------------------------------------
-- Cashier PIN reset requests.
--
-- Cashiers don't set their own PINs — a forgotten PIN raises a request that the
-- store OWNER resolves by setting a new one. A cashier may have at most one
-- pending request at a time (partial unique index). Tenant-fenced like
-- everything else.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cashier_pin_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  cashier_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cashier_name    TEXT        NOT NULL,            -- snapshot at request time
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'resolved', 'rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pin_requests_tenant_idx ON cashier_pin_requests (tenant_id, created_at DESC);
-- One open request per cashier at a time.
CREATE UNIQUE INDEX IF NOT EXISTS pin_requests_one_pending_per_cashier
  ON cashier_pin_requests (cashier_user_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Per-tenant e-wallet checkout QR codes.
--
-- Owners upload their real GCash / Maya / QRPH "scan to pay" codes; the POS
-- checkout shows the uploaded image to the customer instead of the placeholder.
-- Only the public image URL is stored (bytes live on the uploads store, like
-- product images). One row per (tenant, method) — re-uploading replaces it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_payment_qrs (
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  method      TEXT        NOT NULL CHECK (method IN ('GCash', 'Maya', 'QRPH')),
  image_url   TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, method)
);

-- ---------------------------------------------------------------------------
-- Finance — operating expenses ledger.
--
-- The revenue side of the merchant P&L already lives in \`sales\` (POS checkout).
-- This table captures the OUTGOING side: rent, payroll, utilities, supplies,
-- etc. The Finance summary endpoint joins the two (net sales − expenses) to
-- derive profit. Money is integer centavos; \`incurred_on\` is the business date
-- the cost applies to (which may differ from when it was keyed in). Strictly
-- tenant-fenced like every other merchant table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  incurred_on     DATE        NOT NULL,
  category        TEXT        NOT NULL,
  payee           TEXT,
  amount_cents    INTEGER     NOT NULL CHECK (amount_cents >= 0),
  payment_method  TEXT        NOT NULL DEFAULT 'Cash'
                              CHECK (payment_method IN ('Cash','GCash','Maya','Bank Transfer','Card','Other')),
  note            TEXT,
  created_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_tenant_idx ON expenses (tenant_id, incurred_on DESC);

-- ---------------------------------------------------------------------------
-- Procurement — suppliers + purchase orders.
--
-- The owner records who they buy from (\`suppliers\`) and raises purchase orders
-- (\`purchase_orders\` + \`purchase_order_items\`) against them. Receiving a PO is
-- the inbound counterpart to a POS sale: it runs in one transaction that bumps
-- \`products.stock\` for every line that maps to a catalogue product, then freezes
-- the PO as received. Money is integer centavos; line items snapshot the name +
-- unit cost so later product edits never rewrite procurement history. PO numbers
-- are serialized per Tenant via \`po_counters\` (same locked-upsert trick as the
-- BIR invoice serializer) so two clerks can't collide on a reference. Strictly
-- tenant-fenced like everything else.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  contact_name  TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  note          TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  supplier_id   UUID        REFERENCES suppliers (id) ON DELETE SET NULL,
  reference     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
  order_date    DATE        NOT NULL,
  expected_date DATE,
  received_at   TIMESTAMPTZ,
  total_cents   INTEGER     NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  note          TEXT,
  created_by    UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_tenant_idx ON purchase_orders (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_tenant_reference_key
  ON purchase_orders (tenant_id, lower(reference));

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id            UUID NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products (id) ON DELETE SET NULL,
  name             TEXT        NOT NULL,           -- snapshot at time of order
  qty              INTEGER     NOT NULL CHECK (qty > 0),
  unit_cost_cents  INTEGER     NOT NULL CHECK (unit_cost_cents >= 0),
  line_total_cents INTEGER     NOT NULL
);

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (po_id);

CREATE TABLE IF NOT EXISTS po_counters (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  next_seq   BIGINT      NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Manufacturing — recipes (Bill of Materials) + production runs.
--
-- A \`recipe\` says how many units of a finished catalogue product one batch
-- yields, from a list of component products (\`recipe_components\`) consumed per
-- batch. Producing (\`production_runs\`) is the manufacturing counterpart to a
-- POS sale + a PO receive rolled into one transaction: it DECREMENTS each
-- component's \`products.stock\` (component qty × batches) and INCREMENTS the
-- finished good's stock (output qty × batches), then freezes an immutable run
-- record with a per-Tenant serial (\`production_counters\`, same locked-upsert as
-- the invoice/PO serializers). Quantities are integer units (matching the
-- integer \`products.stock\` model). Strictly tenant-fenced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES products (id) ON DELETE CASCADE,  -- finished good
  output_qty  INTEGER     NOT NULL DEFAULT 1 CHECK (output_qty > 0),
  note        TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipes_tenant_idx ON recipes (tenant_id);
CREATE INDEX IF NOT EXISTS recipes_product_idx ON recipes (product_id);

CREATE TABLE IF NOT EXISTS recipe_components (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products (id) ON DELETE SET NULL,  -- ingredient
  name        TEXT    NOT NULL,                                  -- snapshot
  qty         INTEGER NOT NULL CHECK (qty > 0)                   -- consumed per batch
);

CREATE INDEX IF NOT EXISTS recipe_components_recipe_idx ON recipe_components (recipe_id);

CREATE TABLE IF NOT EXISTS production_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  recipe_id     UUID        REFERENCES recipes (id) ON DELETE SET NULL,
  reference     TEXT        NOT NULL,
  product_id    UUID        REFERENCES products (id) ON DELETE SET NULL,
  product_name  TEXT        NOT NULL,                            -- snapshot
  batches       INTEGER     NOT NULL CHECK (batches > 0),
  output_qty    INTEGER     NOT NULL,                            -- total finished units produced
  note          TEXT,
  created_by    UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_runs_tenant_idx ON production_runs (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS production_runs_tenant_reference_key
  ON production_runs (tenant_id, lower(reference));

CREATE TABLE IF NOT EXISTS production_run_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES production_runs (id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products (id) ON DELETE SET NULL,
  name          TEXT    NOT NULL,                                -- snapshot
  qty_consumed  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS production_run_items_run_idx ON production_run_items (run_id);

CREATE TABLE IF NOT EXISTS production_counters (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  next_seq   BIGINT      NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- HR — employee roster, attendance, payroll.
--
-- \`employees\` is the staff roster (a superset of the system \`users\`: a barista
-- with no login still has a record; \`user_id\` optionally links a row to its
-- cashier/manager login). \`attendance\` is one row per employee per day.
-- \`payroll_runs\` + \`payroll_items\` snapshot a pay period: gross pay is computed
-- server-side from each employee's pay type and the attendance in range
-- (Monthly → flat rate; Daily → rate × days present; Hourly → rate × hours),
-- serialized per Tenant via \`payroll_counters\`. Money is integer centavos;
-- attendance hours are NUMERIC. Statutory deductions (SSS/PhilHealth/Pag-IBIG/
-- tax) are out of scope for v1 — runs record GROSS pay. Strictly tenant-fenced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES users (id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  position        TEXT,
  employment_type TEXT        NOT NULL DEFAULT 'Full-time'
                              CHECK (employment_type IN ('Full-time', 'Part-time', 'Contract')),
  pay_type        TEXT        NOT NULL DEFAULT 'Monthly'
                              CHECK (pay_type IN ('Monthly', 'Daily', 'Hourly')),
  pay_rate_cents  INTEGER     NOT NULL DEFAULT 0 CHECK (pay_rate_cents >= 0),
  hire_date       DATE,
  phone           TEXT,
  email           TEXT,
  note            TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_tenant_idx ON employees (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  employee_id UUID        NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  work_date   DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'Present'
                          CHECK (status IN ('Present', 'Absent', 'Leave', 'Half-day')),
  hours       NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (hours >= 0),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One attendance row per employee per day (upserts target this).
CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_date_key ON attendance (employee_id, work_date);
CREATE INDEX IF NOT EXISTS attendance_tenant_date_idx ON attendance (tenant_id, work_date);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  reference         TEXT        NOT NULL,
  period_start      DATE        NOT NULL,
  period_end        DATE        NOT NULL,
  total_gross_cents INTEGER     NOT NULL DEFAULT 0,
  headcount         INTEGER     NOT NULL DEFAULT 0,
  note              TEXT,
  created_by        UUID        REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_runs_tenant_idx ON payroll_runs (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_tenant_reference_key
  ON payroll_runs (tenant_id, lower(reference));

CREATE TABLE IF NOT EXISTS payroll_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES payroll_runs (id) ON DELETE CASCADE,
  employee_id    UUID REFERENCES employees (id) ON DELETE SET NULL,
  name           TEXT         NOT NULL,            -- snapshot
  pay_type       TEXT         NOT NULL,
  pay_rate_cents INTEGER      NOT NULL,
  basis_qty      NUMERIC(8,2) NOT NULL,            -- days or hours; 1 for monthly
  gross_cents    INTEGER      NOT NULL
);

CREATE INDEX IF NOT EXISTS payroll_items_run_idx ON payroll_items (run_id);

CREATE TABLE IF NOT EXISTS payroll_counters (
  tenant_id  UUID PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  next_seq   BIGINT      NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- CRM — customers + loyalty.
--
-- A \`customers\` book the store can attach to a POS sale at checkout (see the
-- \`sales.customer_id\` link below). Each customer's purchase history and lifetime
-- spend derive live from \`sales\`; \`loyalty_points\` accrues at checkout (1 point
-- per ₱100 of net sale) inside the same ACID order transaction. Strictly
-- tenant-fenced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  tags           TEXT[]      NOT NULL DEFAULT '{}',
  note           TEXT,
  loyalty_points INTEGER     NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_tenant_idx ON customers (tenant_id, lower(name));

-- Attach a sale to a customer (set at POS checkout; nulled if the customer is
-- later deleted, so sales history is never lost).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales (customer_id);

-- ---------------------------------------------------------------------------
-- Owner Account hub — store profile, receipt customization, personal profile,
-- preferences, login auditing and device sessions.
--
-- These columns make the owner's Account page real: the store's identity (used
-- on receipts, invoices and the customer display) was previously seeded/static;
-- now the owner edits it. The \`sessions\` + \`login_events\` tables turn the
-- stateless JWT cookie into something auditable and revocable — every sign-in
-- mints a session row (the sid is carried inside the JWT) and is logged, so the
-- owner can see active devices and recent sign-ins and sign other devices out.
-- Strictly tenant-fenced like everything else.
-- ---------------------------------------------------------------------------

-- Store / business profile (one Tenant = one store). Feeds receipts, the BIR
-- invoice header and the customer-facing display. All optional; the seeded
-- \`name\`/\`slug\` already exist above.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address          TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone            TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email            TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tin              TEXT;   -- BIR Taxpayer ID No.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url         TEXT;   -- public asset link

-- Receipt / invoice customization (display-only; never affects the gap-free
-- numbering). \`invoice_prefix\` is the serial prefix the POS stamps (default SI
-- → SI-000123); changing it is safe because the per-Tenant counter keeps
-- incrementing and uniqueness is scoped to (tenant_id, reference).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_header   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_footer   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS vat_label        TEXT;   -- e.g. "VAT REG TIN"
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_prefix   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS receipt_show_logo BOOLEAN NOT NULL DEFAULT TRUE;

-- Personal profile for an owner/manager account (shown in the dashboard chrome).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Per-user preferences. \`theme\` persists the Light/Dark choice to the account so
-- it follows the owner across devices; the notify_* flags gate which alerts the
-- workspace surfaces.
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system'
  CHECK (theme IN ('light', 'dark', 'system'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_low_stock     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_variance      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_daily_summary BOOLEAN NOT NULL DEFAULT FALSE;

-- Device sessions. One row per successful sign-in; the row id is the \`sid\`
-- baked into the JWT, so the stateless cookie maps back to a revocable record.
-- The auth middleware checks this on each authenticated request: a row that is
-- missing or has \`revoked_at\` set turns the still-unexpired cookie into a 401,
-- which is what makes "sign out everywhere" / per-device revoke actually bite.
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id     UUID        REFERENCES tenants (id) ON DELETE CASCADE,
  method        TEXT        NOT NULL,                -- google | password | pin | impersonate
  ip            TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id, last_seen_at DESC);

-- Login audit trail. Immutable append-only log of every successful sign-in, for
-- the owner's "recent sign-ins" panel (spot anything they don't recognise).
CREATE TABLE IF NOT EXISTS login_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id   UUID        REFERENCES tenants (id) ON DELETE CASCADE,
  method      TEXT        NOT NULL,                  -- google | password | pin | impersonate
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Notifications — the per-user bell feed across every role.
--
-- One row per recipient (fan-out): a store low-stock alert becomes a row for
-- each owner/manager who opted in; a platform event becomes a row for each
-- SUPER_ADMIN. \`tenant_id\` is null for platform (admin) notifications. Each
-- carries a \`dedupe_key\` so the same underlying event (a product crossing its
-- floor, a lead, a shift variance) can't pile up duplicate UNREAD rows for the
-- same user — the partial unique index makes a repeat insert a no-op until the
-- existing one is read. Strictly per-user; the API only ever returns rows that
-- belong to the requesting session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  tenant_id   UUID        REFERENCES tenants (id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,   -- low_stock | variance | pin_request | new_lead | new_tenant | health
  severity    TEXT        NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info', 'success', 'warning', 'danger')),
  title       TEXT        NOT NULL,
  body        TEXT,
  link        TEXT,                   -- frontend route to open on click
  dedupe_key  TEXT        NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
-- At most one UNREAD row per (user, dedupe_key): repeat events coalesce until read.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_unread_dedupe
  ON notifications (user_id, dedupe_key) WHERE read_at IS NULL;
`;

async function migrate() {
  console.log("[migrate] applying schema…");
  await pool.query(SQL);
  console.log(
    "[migrate] done. leads, tenants, users, categories, products, sales, sale_items, invoice_counters, cashier_shifts, cashier_pin_requests, tenant_payment_qrs, expenses, suppliers, purchase_orders, purchase_order_items, po_counters, recipes, recipe_components, production_runs, production_run_items, production_counters, employees, attendance, payroll_runs, payroll_items, payroll_counters, customers, sessions, login_events, notifications ready.",
  );
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] failed:", err);
    pool.end().finally(() => process.exit(1));
  });
