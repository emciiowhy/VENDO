# Staging Validation Runbook — Financial Reports

**Audience:** deployment / on-call engineers validating a release on **staging** before a production push.
**Scope:** the derived financial reports added to the Finance + Procurement modules — **Balance Sheet**, **Cash Flow**, and **Reorder Suggestions**.
**Tool:** `backend/src/validateReports.ts`, run via `npm run validate:reports`.

This harness exercises the **real HTTP runtime** (auth → routing → SQL) against a running environment, sweeps **every active tenant** via Super-Admin impersonation, asserts the accounting invariants, and **times every call**. It is **read-only** and **always exits 0** (report-only) — it never mutates data and never fails a pipeline. Read the printed table.

> **When to run:** after deploying to staging (and running `npm run migrate`, which applies the idempotent `purchase_order_items_product_idx`), and any time a data anomaly is suspected in the reports.

---

## 1. Prerequisites

### 1.1 You need a Super-Admin session cookie

The seeded `SUPER_ADMIN` signs in with **Google only** (the password path requires a Store ID, which platform admins don't have), and headless Google OAuth can't be scripted. So the script authenticates by **reusing your live admin session cookie**. You copy it from your browser after signing in.

This is safe: the cookie is short-lived, used only to list tenants and mint per-tenant owner sessions (impersonation), and the script performs **no writes**.

### 1.2 Extract the `vendopos_session` cookie

Sign into the **staging** admin console in your browser, then:

**Chrome / Edge**
1. Open DevTools — `F12` (or `Ctrl+Shift+I` / `Cmd+Option+I`).
2. Go to the **Application** tab.
3. Left sidebar → **Storage** → **Cookies** → select the staging origin (e.g. `https://staging.vendopos.example`).
4. Find the row with **Name** = `vendopos_session`.
5. Double-click the **Value** cell and copy the full token (it's a long JWT-like string).

**Firefox**
1. Open DevTools — `F12`.
2. Go to the **Storage** tab.
3. Left sidebar → **Cookies** → select the staging origin.
4. Find **Name** = `vendopos_session`, copy its **Value**.

> Copy the **value only** — not the `vendopos_session=` prefix, and not the trailing attributes (`Path`, `HttpOnly`, etc.). The script adds the cookie name for you.
>
> ⚠️ `vendopos_session` is typically flagged **HttpOnly**, so `document.cookie` in the JS console will **not** show it — you must read it from the Application/Storage panel as above.

### 1.3 Know your target URL

`BASE_URL` is the staging API origin (no trailing slash), e.g. `https://staging.vendopos.example`. It defaults to `http://localhost:4000` if unset.

---

## 2. Running the harness

Run from the `backend/` directory.

### 2.1 Standard run (default 500 ms slow threshold, 3 months of cash flow)

```bash
BASE_URL=https://staging.vendopos.example \
ADMIN_SESSION_COOKIE=<paste-cookie-value> \
npm run validate:reports
```

### 2.2 Strict performance check (flag anything over 200 ms)

Use this to hunt latent slowness on a high-volume tenant — e.g. to confirm the `DISTINCT ON` rewrite + index are doing their job.

```bash
BASE_URL=https://staging.vendopos.example \
ADMIN_SESSION_COOKIE=<paste-cookie-value> \
SLOW_MS=200 \
npm run validate:reports
```

### 2.3 Deeper history (check 12 months of cash flow, e.g. for a mid-year tenant)

```bash
BASE_URL=https://staging.vendopos.example \
ADMIN_SESSION_COOKIE=<paste-cookie-value> \
CASHFLOW_MONTHS=12 \
npm run validate:reports
```

### 2.4 Windows PowerShell (env vars set inline differently)

```powershell
$env:BASE_URL="https://staging.vendopos.example"
$env:ADMIN_SESSION_COOKIE="<paste-cookie-value>"
$env:SLOW_MS="200"
npm run validate:reports
```

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:4000` | Staging API origin (no trailing slash). |
| `ADMIN_SESSION_COOKIE` | *(required)* | The `vendopos_session` **value** copied from your browser. |
| `SLOW_MS` | `500` | Flag (`⚠`) any single call slower than this. |
| `CASHFLOW_MONTHS` | `3` | How many recent months of cash flow to check per tenant. |
| `SESSION_COOKIE_NAME` | `vendopos_session` | Override only if the deployment changed the cookie name. |

---

## 3. Reading the output

The script prints one row per active tenant:

```
Tenant                    Result    Slowest                 Detail
──────────────────────────────────────────────────────────────────────────────
Aling Nena Sari-Sari      ✓ ok      cash-flow 2026-04 41ms  all invariants hold
Metro Grocer (Cubao)      ✓ ok      balance-sheet 318ms     all invariants hold
Quiet Mart                – skip                            no active owner to impersonate
Big Volume Foods          ✗ FAIL    balance-sheet 612ms ⚠   assets 1500000 ≠ liabilities+equity 1499900

[validate] summary: 2 ok · 1 FAIL · 1 skipped · 1 over 500ms
```

| Result | Meaning |
|---|---|
| `✓ ok` | All invariants held; no call exceeded `SLOW_MS`. |
| `✗ FAIL` | An accounting invariant broke **or** an endpoint returned non-200. The **Detail** column says which. Investigate before prod. |
| `– skip` | Tenant has no active owner to impersonate (nothing to validate). Not a failure. |
| `⚠` (in Slowest) | That tenant's slowest call exceeded `SLOW_MS` — check query plans / indexes. |

A clean run = **0 FAIL** and acceptable timings on your **highest-volume** tenant (it surfaces itself in the *Slowest* column). That's the green light for a confident, migration-light production push.

---

## 4. Invariant cheat-sheet — *why* these checks

If an anomaly surfaces, here's the maths the script is enforcing, so you can reason about *what's actually wrong*.

### 4.1 Balance Sheet: `Assets ≡ Liabilities + Equity`

The fundamental accounting equation. In VendoPOS these figures are **derived from the ledgers** (see `backend/src/finance/finance.reports.ts`):

- **Assets** = Cash & equivalents + Inventory on hand (at latest purchase cost).
- **Liabilities** = Output VAT payable (cumulative) + Accounts payable (open purchase orders).
- **Equity** = Assets − Liabilities (owner's equity, the *residual / balancing figure*).

Because equity is **defined as the residual**, `Assets == Liabilities + Equity` holds **by construction** — so a failure here is **not** an accounting disagreement, it's a **bug or data-integrity signal**: an integer overflow, a `NULL` that escaped a `coalesce`, a mismatched aggregate, or a serialization issue. **Treat any balance-sheet FAIL as a code/data defect, not a bookkeeping quirk.**

> Cash is a *derived proxy*: `Σ sales collected − Σ expenses − Σ goods received`. It is internally consistent (receiving stock moves value cash→inventory; a sale raises cash and a matching VAT liability), **not** a reconciled bank balance.

### 4.2 Cash Flow: `Opening + Net change ≡ Closing`  and  `Inflows − Outflows ≡ Net change`

A direct-method statement for one Manila month:

- **Opening cash** = the cumulative cash position **strictly before** the month.
- **Net change** = Inflows (sales collections) − Outflows (operating expenses + inventory received).
- **Closing cash** = Opening + Net change.

Both identities must hold for **every** month checked — including months **before a mid-year tenant existed**, where every figure should be `0` (this is the historical-gap edge case). A break means a boundary bug (e.g. a timezone/`AT TIME ZONE` edge on `created_at`) or a cumulative-vs-period mismatch.

### 4.3 Why money math here is rounding-safe

All amounts are **integer centavos**, and the reports only **sum pre-rounded integers** (and value inventory as `stock × unit_cost_cents`, int × int). They never multiply by a tax rate or divide — so they **cannot introduce** rounding drift. VAT is computed once at checkout and frozen on the sale row; the reports just sum it. (If a VAT figure ever looks off, the cause is upstream at checkout, not in these reports.)

---

## 5. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `ADMIN_SESSION_COOKIE is required` | You didn't set the env var. See §1.2. |
| `could not list tenants (HTTP 401)` | Admin cookie is expired/wrong, or copied with extra characters. Re-sign-in and re-copy the **value only**. |
| `could not list tenants (HTTP 403)` | The cookie belongs to a non-admin session. You must be signed in as `SUPER_ADMIN`. |
| Many tenants `– skip` | Those tenants were provisioned without an active owner — expected for placeholder/demo tenants. |
| A tenant is consistently `⚠` slow | Confirm `npm run migrate` ran on staging (the `purchase_order_items_product_idx` index must exist). Then inspect the query plan for that tenant's volume. |
| Script "hangs" | `BASE_URL` may be unreachable from where you're running it (VPN / network). Verify the API responds: `curl $BASE_URL/api/v1/health` (or your health route). |

---

## 6. Related references

- Harness source (heavily commented): `backend/src/validateReports.ts`
- Report builders (pure, unit-tested): `backend/src/finance/finance.reports.ts`, `backend/src/procurement/procurement.reorder.ts`
- Gap analysis + execution log: `ERP-POS-Gap-Analysis-Report.md` (repo root)
