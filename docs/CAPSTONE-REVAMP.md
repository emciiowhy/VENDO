# VendoPOS — Capstone Revamp

Branch: `feat/capstone-revamp` · Stack: Next.js + React + TypeScript (frontend), Express + Zod + PostgreSQL/Neon (backend) · No new dependencies were added.

This document is the hand-off for the revamp: what changed, how to run and deploy it safely, how each module works (for the defense), the test results, and the known limitations.

---

## 1. What changed, in one page

| Area | Before | Now |
|---|---|---|
| **Discounts** | A cashier could type any % or ₱ discount. | Cashiers only **tap** a predefined discount: Senior Citizen, PWD, the owner's promos, or the loyalty member %. The **server** prices every sale. Only the owner sets amounts. |
| **Activity log** | 3 register events (line void, cancel, drawer pop). | One staff timeline: sales, refunds, voids, discounts, sign-in/out, Shift In/Out, drawer open/close, timecard fixes, payroll approval — written by the server. Owners/managers only. |
| **Product Management** | Called "Inventory". | Renamed. Stock edits record a reason (Restock / Damaged / Count correction). |
| **Procurement, Manufacturing** | Active modules. | Switched off (APIs return 404, UI redirects). Code and every row kept. |
| **BIR** | "BIR-ready / compliant / accredited" claims; receipts titled "SALES INVOICE". | Claims removed. Receipts are titled **RECEIPT** and carry a fixed line: *"Not a BIR-registered invoice. Not valid for claim of input tax."* |
| **People & Payroll** | "HR", 7 tabs, attendance typed by hand, SSS/PhilHealth/Pag-IBIG deductions. | 3 tabs: **Employees · Attendance · Payroll**. Attendance comes from Shift In / Shift Out and a work schedule. Payroll = daily rate ÷ standard hours × regular hours, Draft → Approved. Statutory deductions removed. |
| **VAT** | Every store assumed VAT-registered; a "VAT (12% incl.)" line sat between the discount and the total, reading like an extra charge. | Owner setting **VAT-registered? Yes/No**. Non-VAT stores book ₱0 VAT, receipts read NON-VAT REG TIN with no VAT summary, Senior/PWD is a plain 20% off. VAT-registered stores show *"Includes ₱x VAT (12%)"* under the total. Totals never change — PH prices are VAT-inclusive. |
| **Long lists** | Some silently cut off at 50–500 rows. | Numbered pagination everywhere (server-side for logs and sales). |

---

## 2. Setup and safe deployment

### 2.1 Local development (uses the Neon **dev** branch — never production)

1. In the Neon console: **Branches → Create branch** `dev` from `main`, and a second untouched branch `backup-YYYY-MM-DD` as the restore point.
2. Put the **dev** branch connection string in `backend/.env` as `DATABASE_URL` (never commit `.env`; it is git-ignored).
3. Install and migrate:
   ```bash
   cd backend && npm install && npm run migrate   # additive only — safe to re-run
   npm run dev
   cd ../frontend && npm install && npm run dev
   ```

### 2.2 Tests

```bash
cd backend && npx vitest run          # 498 unit/route tests, no database needed
cd backend && npx tsc --noEmit -p .   # type check
cd frontend && npx tsc --noEmit -p . && npm run build
```

Smoke tests run the real routes against a real database — **dev branch only**:

```bash
cd backend
npx tsx scripts/smoke-discounts.ts    # discount pricing, stock deduction, voids
npx tsx scripts/smoke-activity.ts     # activity log entries + store isolation
npx tsx scripts/smoke-attendance.ts   # schedule statuses, missing Shift Out fix
npx tsx scripts/smoke-payroll.ts      # base pay, blockers, approval, lock
npx tsx scripts/smoke-paging.ts       # server pagination totals
npx tsx scripts/smoke-isolation.ts    # store A can't touch store B's data
npx tsx scripts/smoke-vat.ts          # non-VAT store end to end
```

Each script cleans up what it creates (activity-log rows stay — the log is append-only by design).

### 2.3 Deploying to production

> **Merging to `main` migrates production automatically.** `render.yaml` runs `npm run migrate` on every deploy of `main`.

1. Take a fresh Neon backup branch of production first.
2. Merge `feat/capstone-revamp` → `main`. Render builds, runs the migration, and starts the API.
3. Every migration is additive (`ADD COLUMN IF NOT EXISTS`, new tables, CHECK constraints only widened). No table or row is dropped. Existing payroll runs become *approved* history and display exactly as before.
4. After deploy: each owner should set **VAT-registered** correctly under Account → Receipt (it defaults to *yes*), then (a) set every employee's **daily rate** and **work schedule**, (b) review promos/loyalty under CRM → Discounts, and (c) untick Senior/PWD eligibility on items the benefit doesn't cover.

---

## 3. Module guide for the defense

### 3.1 Discounts (POS + CRM → Discounts)

**What it does.** The cashier can't type a discount. They tap one of: **Senior Citizen**, **PWD**, an **owner promo** (e.g. "Payday 10%"), or the **member discount** (when a CRM customer is attached). One discount per sale; loyalty points can still be redeemed on top.

**How it works.**
- The register sends only a *category* or a *promo id* — never an amount. The server's `priceCart()` (`backend/src/pos/pos.schema.ts`) computes every peso from the database: item prices, the promo's owner-set value, the member % from settings.
- **Senior Citizen / PWD** (RA 9994 / RA 10754): VAT is removed from eligible items first, then 20% off. Items can be marked ineligible (e.g. alcohol) in Product Management; they're charged normally. The ID number, cardholder name and an "exclusive use" confirmation are required and printed on the receipt; the activity log stores the ID masked to its last 4 characters.
- **No stacking**: the request shape allows exactly one discount, so Senior/PWD can never be combined with a promo (the law bars double discounts).
- The register shows a preview using a mirror of the same function; `frontendParity.test.ts` checks the two agree on 3,000 random carts.

**Security points.** Cashier → 403 on every discount setting. **Only the owner** can create/edit promos or change loyalty rates (managers see them read-only). A paused, deleted or other-store promo is refused at checkout.

### 3.2 Activity log (Activity log page)

**What it does.** Shows who did what: sales, refunds, voids, discounts, sign-in/out, Shift In/Out, drawer open/close, timecard corrections, payroll approvals. Filters by person, action and date; paginated.

**How it works.** Each event is written **by the server** in the route that did the work (`logActivity`), so the register can't forge or hide one. Writing the log never breaks the action (a failure is logged and swallowed). The table is append-only — no edit/delete route exists.

**Security points.** Owner/manager only (cashier → 403). Every query is scoped to the signed-in user's store.

The **Drawer audit** (Z-Read cash variance per closed shift) is on the same page.

### 3.3 Product Management

Renamed from Inventory (URLs/API unchanged). Add/edit products, categories, prices, stock, low-stock alerts. **Stock moves only through the stock ledger**: every sale deducts it inside the same database transaction as the sale, every void restores it, and a manual edit is a logged adjustment with a reason.

### 3.3a VAT (Account → Receipt)

Philippine retail prices **include** VAT, so the total is never increased by it. For a VAT-registered store the register notes *"Includes ₱10.61 VAT (12%)"* under the total (₱99 × 12/112) and receipts print the VATable / exempt / VAT breakdown. Most small businesses (under ₱3M a year) are **non-VAT**: the owner turns **VAT-registered** off, and from then on every sale books ₱0 VAT (lines are stored as non-VAT, so refunds reverse none), receipts read **NON-VAT REG TIN** with no VAT lines, and Senior/PWD is a plain 20% off. Only the owner can change it (a manager gets 403). Totals are identical either way.

### 3.4 People & Payroll

**Employees.** Clicking an employee shows: name and position, daily rate, work schedule, a monthly **attendance calendar**, an attendance log (date, Time In, Time Out, break, hours, status), and the **payroll history** (approved runs only).

**Attendance.** Derived, never typed in — `buildAttendanceDays()` in `backend/src/hr/attendance.ts`:
- **Shift In = Time In, Shift Out = Time Out** (the labor clock, `timecards`). The cash drawer (X/Z-Read) is separate and unchanged.
- Hours worked = time on the clock − the unpaid break (deducted once on days of 5+ hours).
- Status from the employee's **work schedule**: scheduled day with no punch → **Absent (red)**; not a work day → **Rest day (grey)**; under half the standard day → **Half-day (yellow)**; otherwise **Present (green)**; manager-marked Leave → **blue**.
- **Forgotten Shift Out**: the next Shift In closes the old card at 0 hours and flags it **Needs review** (amber). The manager enters the real Time Out; the fix is logged. The system never guesses hours.
- Duplicate active shifts are impossible (a database unique index).

**Payroll.** `backend/src/hr/payroll.ts`:
```
Hourly rate  = Daily rate ÷ Standard daily hours
Base         = Hourly rate × eligible regular hours (capped at the standard day)
Final pay    = Base + approved adjustments
Example: ₱600/day, 8h standard, 6h worked → ₱600 ÷ 8 × 6 = ₱450
```
- A run starts as a **Draft**. Overtime (125%) and paid leave are *suggested* adjustments that count only when ticked. Manual +/- adjustments are allowed.
- **Approval is refused** while any daily rate is unconfirmed or any timecard in the period needs review. Approved runs are **locked** (no edit/delete) and export as CSV.
- **A manager can't approve a run containing their own pay**, set their own rate, or change their own pay on the employee record — only the owner can. Cashiers → 403.
- Runs can't overlap another run's dates (no paying a day twice).
- All money is integer centavos with one rounding per figure.
- SSS, PhilHealth, Pag-IBIG and withholding tax are **not computed** — the employer handles them outside VendoPOS.

### 3.5 Security model (cross-cutting)

| Control | Where |
|---|---|
| Authentication | Google OAuth + password for owners/managers, 4-digit PIN for cashiers (unchanged). Signed session cookie, revocable sessions. |
| Role-based access | `requireRole(...)` on every router; extra owner-only / owner-or-manager checks per route. |
| Store (tenant) isolation | Every query filters by `tenant_id` from the **session**, never from the request. Tested by `smoke-isolation.ts`. |
| Input validation | Zod schemas on every write; IDs and dates checked before reaching SQL. |
| SQL injection | Parameterised queries (`$1, $2…`) everywhere; no user input is concatenated into SQL. |
| Server-side pricing | `priceCart()`; prices read from the database under a row lock. |
| Audit trail | Activity log (store) + admin audit trail (platform). |
| Secrets | `.env` git-ignored; a script that printed the DB URL was removed. |
| Errors | Users get a plain message; details are logged server-side only. |

### 3.6 Questions the panel may ask

- *"Can a cashier give a 100% discount?"* — No. There's no amount field, and the server ignores any amount it's sent; it prices from the database.
- *"What if a cashier forgets to clock out?"* — The next Shift In flags it; it pays 0 hours until a manager enters the real time, and payroll can't be approved until it's fixed.
- *"Can a manager pay themselves more?"* — No: they can't change their own rate and can't approve a run that includes their own pay.
- *"Can one store see another's data?"* — No: every query is scoped to the signed-in store; the isolation test attacks 19 different endpoints with real IDs and every one is refused.
- *"Is VendoPOS BIR-accredited?"* — No, and the system says so on every receipt.

---

## 4. Test results (latest run)

| Check | Result |
|---|---|
| Backend type check | ✅ clean |
| Backend unit + route tests (Vitest) | ✅ **502 / 502** |
| Frontend type check | ✅ clean |
| Frontend lint | ✅ 0 errors (24 warnings, none in files added or changed by the revamp) |
| Frontend production build | ✅ 81 pages |
| Smoke — discounts | ✅ 16 / 16 |
| Smoke — activity log | ✅ 10 / 10 |
| Smoke — attendance | ✅ 13 / 13 |
| Smoke — payroll | ✅ 26 / 26 |
| Smoke — pagination | ✅ 11 / 11 |
| Smoke — store isolation | ✅ 19 / 19 |
| Smoke — VAT registration | ✅ 11 / 11 |

Required scenarios from the brief:

| Scenario | Covered by |
|---|---|
| Cashier cannot edit discounts | `crm/discounts.test.ts` (403s), `pos.test.ts` (free-form discounts rejected) |
| Authorized discounts calculate correctly | `pos.test.ts` (`priceCart`), `frontendParity.test.ts`, `smoke-discounts.ts` |
| POS sales still work | `smoke-discounts.ts`, `smoke-activity.ts` (real checkouts) |
| Stock deduction still works | `smoke-discounts.ts` (deducted on sale, restored on void) |
| Shift In / Shift Out record attendance | `smoke-attendance.ts`, `smoke-activity.ts` |
| Working hours calculate correctly | `hr/attendance.test.ts` (19 rules), `smoke-attendance.ts` |
| Payroll calculates base earnings correctly | `hr/payroll.test.ts` (incl. ₱600/8h/6h → ₱450), `smoke-payroll.ts` |
| Unauthorized users cannot modify payroll | `hr/payroll.routes.test.ts`, `smoke-payroll.ts` (manager self-pay 403s) |
| Cashier logs restricted to owners/managers | `pos/activity.test.ts` |
| One business can't access another's data | `smoke-isolation.ts` (19 checks), `smoke-activity.ts`, `smoke-attendance.ts` |

**Not verified:** the new screens were type-checked, linted and built, and their logic is tested, but they were not clicked through in a browser by the developer of this change. Do one walkthrough before the defense.

---

## 5. Database changes (all additive)

| Table | Change |
|---|---|
| `tenants` | `vat_registered` (default true), `loyalty_pesos_per_point`, `loyalty_point_value_cents`, `member_discount_pct`, `member_discount_min_spend_cents` (defaults reproduce the old rules) |
| `products` | `sc_pwd_eligible` (default true) |
| `sales` | `sc_pwd_type` (nullable) |
| `promotions` | **new** — owner promos |
| `pos_audit_logs` | `ref_id`; action list widened |
| `employees` | `work_days` (Mon–Sat), `standard_daily_hours` (8), `unpaid_break_minutes` (60), `daily_rate_cents` (nullable) |
| `timecards` | `needs_review` |
| `payroll_runs` | `status` (existing → approved), `approved_by`, `approved_at`, `total_payable_cents` |
| `payroll_items` | attendance/rate snapshot columns, `base_cents`, `payable_cents` |
| `payroll_adjustments` | **new** — overtime / paid leave / manual lines |

Nothing was dropped. Procurement and Manufacturing tables and rows are untouched.

---

## 6. Changed files

**Backend — new:** `crm/promotions.repository.ts`, `hr/attendance.ts`, `hr/attendance.repository.ts`, `hr/payroll.ts`, `hr/payroll.repository.ts`, `lib/paging.ts`; tests `crm/discounts.test.ts`, `hr/attendance.test.ts`, `hr/attendance.routes.test.ts`, `hr/payroll.test.ts`, `hr/payroll.routes.test.ts`, `lib/paging.test.ts`, `pos/activity.test.ts`; `scripts/smoke-*.ts` (6).
**Backend — changed:** `migrate.ts`, `app.ts`, `pos/*` (schema, repository, router, audit, refunds, shifts), `crm/*`, `hr/*` (repository, router, schema, timecard), `products/*`, `inventory/*`, `admin/adminAudit.*`, `auth/auth.router.ts`, `lib/tiers.ts`.
**Backend — removed:** `hr/deductions.ts`, `hr/payroll.processor.ts`, `hr/payroll.export.repository.ts` (+ tests), `test-env.ts`.

**Frontend — new:** `components/Pagination.tsx`, `lib/pagination.ts`, `components/crm/DiscountSettings.tsx`, `components/crm/PromotionsManager.tsx`, `components/hr/AttendanceDayPanel.tsx`.
**Frontend — changed:** POS terminal + receipts (`PosTerminal.tsx`, `receiptPrint.ts`, `lib/escpos.ts`, `SalesReturnsModal.tsx`), CRM, Product Management, People & Payroll (console, profile, calendar, payroll review, forms), Activity log, admin lists, staff self-service, navigation/labels, marketing copy, `next.config.ts` (redirects), `CONTEXT.md`, `README.md`.
**Frontend — removed:** `components/hr/PayrollExportCard.tsx`.

`git log 9709b98..HEAD` lists every commit with a full description.

---

## 7. Known limitations

- **Partial returns of a Senior/PWD sale** that mixed eligible and ineligible items refund a pro-rated share of the discount (full voids are exact).
- **Group dining** (splitting the Senior/PWD share of a shared bill) isn't automated — ring the cardholder's portion as its own sale.
- **Payroll** does not compute night differential, holiday or rest-day premiums, or statutory contributions/tax — add them as adjustments; the employer files contributions outside the system.
- **Public holidays** aren't tracked; holiday days show by the normal schedule.
- **Employees without a till login** have no Shift In/Out, so their days come only from manual entries.
- A **sign-out** is logged when someone presses Log out; a session that simply expires isn't.
- **Not BIR-accredited**: receipts aren't official invoices.
- **Stock-movement history** has a paginated API but no screen yet.

## 8. Open item

- `frontend/app/about/page.tsx` (commit `a34b33d`) re-introduces BIR claims ("BIR compliance", "BIR-ready", "BIR serials"). Reword before the defense to stay consistent with the rest of the product.
