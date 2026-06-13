# VendoPOS — Cloud ERP & Integrated POS Gap Analysis

**Date:** 2026-06-13
**Audited against:** *Executive Report: Comprehensive Guide to Cloud ERP & Integrated POS Software*
**Method:** direct inspection of `backend/src` (schema in `migrate.ts`, all module routers/repositories) — not from memory.

---

## 1. Verdict — Over-qualified or just qualified?

**VendoPOS is QUALIFIED to deploy today, and OVER-QUALIFIED for the guide's primary target** (tiny→mid single-location retail/food businesses in the Philippines).

It already carries capabilities most commercial SMB POS products do **not**:

- All **five ERP pillars** real and wired: Finance (P&L), Procurement (suppliers + POs that restock), Manufacturing (BOM/recipes + production runs), HR (roster + attendance + payroll), CRM (customers + loyalty).
- **Audit-grade integrity** the guide only implies: an immutable `stock_movements` ledger (every on-hand change is a signed, explainable row), void/return modelled as contra entries so every revenue total nets automatically, gap-free per-tenant BIR invoice serialization under concurrency.
- **BIR/VAT compliance** beyond the guide's "generate VAT returns": per-store + platform-wide compliance registers with consolidated CSV, machine-accreditation receipt footers, shift X-Read/Z-Read reconciliation with centavo variance flags.
- **Platform/operational maturity:** multi-tenant SaaS with billing/MRR, real-time system-health telemetry (SSE), cross-role notifications, revocable device sessions + login audit, role-based access.

**Where it is NOT yet enterprise/regulated-grade:** multi-branch operations and regulated-industry inventory (pharmacy/grocery). Those are the real gaps below.

> **One-line answer:** Over-qualified for single-location PH SMBs; *qualified-with-gaps* for multi-branch chains and batch/expiry-regulated verticals (pharmacy, grocery, food).

---

## 2. Gaps vs. the guide

### Tier A — Real capability gaps, additive to build (low/medium risk)

| # | Gap | Guide reference | Current state |
|---|-----|-----------------|---------------|
| A1 | **Balance Sheet + Cash Flow statements** | §4.5 "P&L, Balance Sheets, and Cash Flow … continuously current" | Only P&L (`/finance/summary`) |
| A2 | **Batch / lot tracking + expiry dates (FIFO)** | §3 inventory layer, §5, §6 (pharmacy/grocery/food) | None — no batch/expiry anywhere |
| A3 | **Barcode scan-to-cart** at POS | §6 grocery "ultra-high speed barcode handling" | `products.sku` exists; no scan input on terminal |
| A4 | **Reorder triggers** (low-stock → draft PO) | §3 "Triggers reorder", §4.4 | Low-stock alerts exist; no one-click reorder |

### Tier B — Real gaps, but they ALTER existing behaviour or architecture (need explicit decision)

| # | Gap | Guide reference | Why it's not purely additive |
|---|-----|-----------------|------------------------------|
| B1 | **Sales commissions** in payroll | §3 HR layer, §5 | Payroll currently computes gross from attendance only; commissions change payroll output |
| B2 | **Multi-location / multi-branch + inter-branch stock transfers** | §4.4, §4.6, §5, §6 retail chains | Requires `location_id` across products/stock/sales — invasive; conflicts with "don't alter what's inside" |

### Tier C — Out of code scope / niche (documented, not recommended for now)

- **Biometric attendance** (§5) — hardware-dependent; manual attendance already exists.
- **SOC 2 / encryption / daily backups** (§4.9) — infrastructure/process, provided by managed Neon Postgres + hosting, not application code.
- **Controlled-substance register** (§6 pharmacy) — an extension of A2 batch tracking.
- **Weight-based pricing engine** (§6 jewelry), **promotions/pricing-rules**, **WIP manufacturing states**, **wholesale price tiers** — vertical-specific; not core to the guide's "5 non-negotiables".

---

## 3. Recommended execution (additive only — nothing existing is rewritten)

**Build now (Tier A — pure additions):**
1. **A1 Finance reporting** — new endpoints `GET /finance/balance-sheet`, `GET /finance/cash-flow`, derived read-only from existing `sales`, `expenses`, inventory valuation and payroll. New frontend tabs alongside the P&L. *No write paths touched.*
2. **A2 Inventory batches + expiry** — new `product_batches` table + optional per-product `track_batches` flag; receiving (procurement) can stamp batch + expiry; near-expiry dashboard + notifications producer reusing the existing bell/SSE pipeline. *Live checkout depletion stays on the cached `stock` model in phase 1 (FIFO auto-depletion is a later, opt-in phase to avoid altering the ACID checkout).*
3. **A3 POS barcode scan-to-cart** — additive keyboard-wedge/scan input on `PosTerminal` matching `products.sku` → add line. *Additive UI only.*
4. **A4 Reorder → draft PO** — additive "Reorder" action on low-stock items that pre-fills a draft purchase order (procurement already exists).

**Decide before building (Tier B — these change existing behaviour):**
- **B1 Commissions:** I can add it as an **opt-in, separate payroll line** (off by default) so existing gross-pay runs are unchanged. Needs your OK because it extends the payroll engine.
- **B2 Multi-location:** genuinely invasive. Recommend a **separate, dedicated effort** with its own approval — not folded into this additive pass.

---

## 4. Verification plan (per item, once built)

- **Backend:** `npm test` (vitest) — add unit tests for new pure helpers (balance-sheet/cash-flow math, FIFO/expiry selection, commission calc); `npm run migrate` applies new tables idempotently; `tsc --noEmit` clean.
- **Frontend:** `tsc --noEmit` + scoped `eslint` clean on new/changed files; `next build` registers new routes.
- **End-to-end:** seed a tenant, receive stock with batch+expiry, ring a barcode sale, confirm Balance Sheet/Cash Flow reconcile to P&L, confirm near-expiry alert fires.

---

*Report generated as an additive artifact; no existing source files were modified to produce it.*

---

## 5. Execution log (2026-06-13)

Per the owner's go-ahead, the additive Tier-A items **A1, A3, A4** were built (A2 batch/expiry and the invasive B1/B2 were deferred by choice). Nothing existing was rewritten — only new endpoints, components and additive UI affordances.

**A1 — Balance Sheet + Cash Flow (Finance):**
- Backend: `finance/finance.reports.ts` (pure `buildBalanceSheet` / `buildCashFlow`, IO-free, 7 unit tests in `finance.reports.test.ts`); repository `getBalanceSheet` + `getCashFlow` (Manila-month, opening→closing reconciliation, inventory valued at latest purchase cost); routes `GET /finance/balance-sheet` and `GET /finance/cash-flow?month=YYYY-MM`.
- Frontend: `lib/finance.ts` clients + `components/finance/FinanceStatements.tsx` (BalanceSheetView + CashFlowView with month stepper); `FinanceConsole` gained a P&L / Balance sheet / Cash flow tab switcher (existing P&L view untouched).

**A3 — Barcode scan-to-cart (POS):** `PosTerminal` search box now resolves an Enter-terminated scan to an exact-SKU product (then sole-result fallback), drops it in the cart, and clears for the next scan; transient "not found / out of stock" feedback. Placeholder updated to "Search or scan barcode…".

**A4 — Reorder → draft PO (Procurement):**
- Backend: `procurement/procurement.reorder.ts` (pure `suggestReorderQty`, 4 unit tests); repository `getReorderSuggestions` (low-stock/depleted active products + suggested qty + last known cost); route `GET /procurement/reorder-suggestions`.
- Frontend: `lib/procurement.ts` client + `components/procurement/ReorderModal.tsx` (tick items, tweak qty → one draft PO via the existing create path); "Reorder low stock" button on the Procurement console.

**Verification:** backend `tsc` clean + **174 tests pass** (163 → 174, +11 new); frontend `tsc` + scoped `eslint` clean; `next build` compiles and prerenders all routes. *(SQL aggregations and SSE-free reads verified by compile/tests/build only — not yet exercised against live seeded data.)*

**Pre-staging performance hardening (2026-06-13):** the "latest purchase cost per product" lookup was rewritten from a per-product `LEFT JOIN LATERAL` (O(products × PO-items) — slow on mature tenants) to a single-scan `WITH latest_cost AS (SELECT DISTINCT ON (product_id) … ORDER BY product_id, po.created_at DESC)` hash-joined to products, in both `getBalanceSheet` and `getReorderSuggestions`. Added idempotent index `purchase_order_items_product_idx ON purchase_order_items (product_id)` in `migrate.ts` so the lookup seeks. Behaviorally identical — same 174 assertions pass. (Cash-flow `AT TIME ZONE` range filters are unchanged and consistent with the existing prod `/summary` + compliance queries; a half-open UTC range is a separate codebase-wide optimization if it ever bites.)

