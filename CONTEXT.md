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

**Human Resources (HR)**:
Employees, shifts, and payroll for a Tenant's own staff.

**Customer Relationship Management (CRM)**:
Tracking Customers and loyalty over time.

### People & Staffing

The Tenant's own workers. Two distinct records exist for the same real person and must not be conflated — they live in different tables and are unlocked by different Plans.

**Employee**:
A person on the Tenant's payroll — the full HR record (position, pay, attendance, PTO). Lives in the `employees` table. HR is an Enterprise-only Module, so Employees exist only on Enterprise Tenants.
_Avoid_: using "Employee" to mean a till login — that is a Cashier.

**Cashier**:
A till login — a `users` row with `role = 'CASHIER'` and a 4-digit PIN that opens shifts and rings up sales. Managed in the owner's Cashiers console; unlocked by `multi_staff_roles` (Business+). A Cashier may exist with no Employee record (Business Tenants have no HR).
_Avoid_: Staff member, user.

**Till access**:
The capability that links an Employee to a Cashier login (`employees.user_id → users.id`), so one real person is both on payroll and able to work the till. The link already drives auto-attendance and the performance report. Only meaningful on Enterprise, where both records coexist.

**Duty roster**:
Who is on the clock right now — derived live from open `cashier_shifts`. Surfaced in the cashier sign-in picker ("Who's on duty right now?"), the POS activation wizard, and the HR overview. Always data-driven; the only hardcoded roster is the marketing illustration.
_Avoid_: calling this a schedule — it reflects who *is* on the till, not who is *rostered to be*.

### Plans

The subscription tiers a Tenant can be on. Tiers differ by which Modules are unlocked. All prices in Philippine peso (₱), billed monthly; these mirror the figures shown on the landing-page pricing section (`frontend/app/components/Pricing.tsx`).

**Starter** — ₱299/mo:
POS + Inventory + BIR-ready receipts + GCash/Maya/QRPH + Senior/PWD discounts. For single-location coffee shops and small retailers.

**Business** — ₱499/mo:
Starter plus CRM (with discount management), Finance & Accounting, multi-staff roles, and custom branding. For growing multi-staff retailers and restaurants.

**Enterprise** — ₱799/mo:
Adds People & Payroll (attendance + payroll) and priority support. (Multi-location is on the roadmap and advertised as "coming soon" — it is not yet shipped.) The landing CTA routes to a contact-sales/demo funnel rather than self-serve signup.
