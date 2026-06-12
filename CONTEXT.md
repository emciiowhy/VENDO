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

**Inventory**:
How much stock a Tenant has and where it sits. The current state of goods on hand.
_Avoid_: folding this into Procurement or Supply Chain — Inventory is what you *have*.

**Procurement & Supply Chain**:
Getting stock in — suppliers, purchase orders, and receiving. How goods *arrive*.
_Avoid_: bundling with Manufacturing.

**Manufacturing**:
Making products from raw materials via recipes / bill-of-materials. How goods are *produced*.

**Finance & Accounting**:
Money in and out — sales reports, expenses, tax, profit & loss.

**Human Resources (HR)**:
Employees, shifts, and payroll for a Tenant's own staff.

**Customer Relationship Management (CRM)**:
Tracking Customers and loyalty over time.

### Plans

The subscription tiers a Tenant can be on. Tiers differ by which Modules are unlocked. All prices in Philippine peso (₱); landing-page figures are indicative placeholders pending finalisation.

**Starter**:
POS + Inventory. For single-location coffee shops and small retailers. Indicative ₱499/mo (placeholder).

**Business**:
Starter plus Procurement & Supply Chain, CRM, and Finance & Accounting. For growing multi-staff retailers and restaurants. Indicative ₱1,499/mo (placeholder).

**Enterprise**:
The full ERP — adds Manufacturing, HR, and multi-location. Pricing is "Contact us" (custom).
