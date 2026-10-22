# VendoPOS

A multi-tenant SaaS point-of-sale and ERP platform. One platform operator sells subscriptions to many independent businesses; each business runs its sales and operations on an isolated tenant.

## Language

### Actors

**Super Admin**:
The owner-operator of VendoPOS itself. Sees everything across every Tenant from the platform dashboard, manages subscriptions, and may hire others to help operate the platform. Sits above all Tenants.
_Avoid_: Platform admin, root, developer

**Customer**:
A shopper who buys goods or services at the point of sale from a Merchant. The person standing at the till.
_Avoid_: using "customer" to mean the subscribing business — that is a Merchant.

**Lead**:
A visitor who submitted the "Request a Demo" form on the landing page but is not yet a Tenant. The Super Admin converts a Lead into a Tenant by onboarding them manually.
_Avoid_: Sign-up, registrant — there is no self-serve account creation at launch.

**Merchant**:
A business that subscribes to VendoPOS to run its own point of sale and operations. The tenant, viewed from the business side.
_Avoid_: Customer, client, account

**Tenant**:
The isolated data-and-configuration boundary that belongs to one Merchant. The same real-world thing as a Merchant, named from the architecture side.

### Modules

The functional areas a Tenant operates inside its dashboard. Each module owns exactly one idea; overlaps are deliberately split.

**Point of Sale (POS)**:
Ringing up a Customer and taking payment. The front-of-house sales surface.

**Inventory** (shown in the UI as **Product Management**):
How much stock a Tenant has and where it sits. The current state of goods on hand. Restocking is a logged stock adjustment on the product.
_Avoid_: renaming the code, routes or `inventory_basic` feature key — only the user-facing label changed.

**Procurement & Supply Chain** — *retired*:
Getting stock in — suppliers, purchase orders, and receiving. Switched off for the capstone scope: the API is unmounted and the UI redirects, but the code and every `suppliers` / `purchase_orders` row are kept, and Finance still reads past POs.

**Manufacturing** — *retired*:
Making products from raw materials via recipes / bill-of-materials. Switched off like Procurement; `recipes`, `ingredients` and `production_runs` rows are kept.

**Finance & Accounting**:
Money in and out — sales reports, expenses, tax, profit & loss.

**Cashiers** (page: `/dashboard/cashiers`, API: `/api/v1/staff`):
The owner's module for the people on the till — two tabs. **Cashiers**: till logins, PINs, opening float, PIN reset requests (any tier). **Attendance**: hours each Cashier worked, read from their Shift In / Shift Out, as a month table + calendar with CSV export (Business+, gated on `multi_staff_roles` like cashier logins). Owner only. Replaced People & Payroll; `/dashboard/hr` and `/dashboard/staff` redirect here.

**Payroll** — *removed*:
VendoPOS doesn't compute pay. The owner works out payroll themselves from the Attendance hours. The payroll API and UI are gone and staff self-service paystubs (`/api/v1/ess`) is unmounted, but `payroll_runs` / `payroll_items` rows are kept. The Employees API (`/api/v1/hr`) is still mounted but has no UI.
_Avoid_: reintroducing pay calculations — it conflicts with how owners pay their staff.

**Shift In / Shift Out**:
Clocking in and out on the labor clock (`timecards`). Shift In is a Cashier's Time In; Shift Out is their Time Out. A punch counts toward the Manila day it started on; a forgotten Shift Out counts no hours until the owner enters the real Time Out in Cashiers → Attendance.
_Avoid_: confusing this with opening or closing the cash drawer (`cashier_shifts`, X/Z-Read), which is about cash, not hours.

**Work schedule**:
The weekly pattern on an Employee — `work_days`, `standard_daily_hours`, `unpaid_break_minutes`. A day's status (present / absent / half-day / rest day) is derived from it plus the timecards, never assumed.

**Customer Relationship Management (CRM)**:
Tracking Customers and loyalty over time.

### People & Staffing

The Tenant's own workers. Two distinct records exist for the same real person and must not be conflated — they live in different tables and are unlocked by different Plans.

**Employee**:
*Dormant.* The old People & Payroll HR record (position, daily rate, schedule, PTO) in the `employees` table. It has no UI since payroll was removed; attendance is now read per Cashier instead.
_Avoid_: using "Employee" to mean a till login — that is a Cashier.

**Cashier**:
A till login — a `users` row with `role = 'CASHIER'` and a 4-digit PIN that opens shifts and rings up sales. Managed in the owner-only Cashiers module (`/dashboard/cashiers`, open on every tier; its Attendance tab is Business+); unlocked by `multi_staff_roles` (Business+). A Cashier may exist with no Employee record.
_Avoid_: Staff member, user.

**Till access**:
*Dormant.* The old link from an Employee to a Cashier login (`employees.user_id → users.id`). No longer needed for attendance — a Cashier's own timecards are their attendance.

**Duty roster**:
Who is on the clock right now — derived live from open `cashier_shifts`. Surfaced in the cashier sign-in picker ("Who's on duty right now?") and the POS activation wizard. Always data-driven; the only hardcoded roster is the marketing illustration.
_Avoid_: calling this a schedule — it reflects who *is* on the till, not who is *rostered to be*.

### Plans

The subscription tiers a Tenant can be on. Tiers differ by which Modules are unlocked. All prices in Philippine peso (₱), billed monthly; these mirror the figures shown on the landing-page pricing section (`frontend/app/components/Pricing.tsx`).

**Starter** — ₱299/mo:
POS + Product Management + VAT-itemized receipts + GCash/Maya/QRPH + Senior/PWD discounts. For single-location coffee shops and small retailers.

**Business** — ₱499/mo:
Starter plus CRM (with discount management), Finance & Accounting, multi-staff roles, cashier attendance (hours + calendar), and custom branding. For growing multi-staff retailers and restaurants.

**Enterprise** — ₱799/mo:
Adds priority support. (Multi-location is on the roadmap and advertised as "coming soon" — it is not yet shipped.) The landing CTA routes to a contact-sales/demo funnel rather than self-serve signup.
