# PRD 0001 — VendoPOS Landing Page

Status: Draft · Date: 2026-06-04 · Owner: Super Admin (platform founder)

> Vocabulary in this document follows [`CONTEXT.md`](../../CONTEXT.md): **Super Admin**, **Tenant/Merchant**, **Customer** (shopper), **Lead**, the seven **Modules**, and the three **Plans**.

## Problem Statement

Filipino business owners — coffee shops, restaurants, and medium-to-large retailers — juggle their sales, stock, suppliers, finances, and staff across spreadsheets and disconnected apps. They have no single system built for the way they actually operate (peso pricing, BIR compliance, GCash/Maya payments, unreliable internet). VendoPOS exists to be that single system, but today a prospective Merchant has no way to discover it, understand what it does, or ask to be onboarded. There is no front door.

## Solution

A public marketing landing page that:

1. Explains, in the Merchant's language, that VendoPOS is one multi-tenant POS + ERP that runs their whole business.
2. Presents the seven Modules as a clear capability story.
3. Leads with the Philippine-specific advantages competitors ignore (BIR-ready receipts, GCash/Maya/QRPH, offline-capable, peso-first).
4. Frames the three Plans (Starter / Business / Enterprise) as a value ladder differentiated by Module bundle.
5. Converts a visitor into a **Lead** via a "Request a Demo" form. There is **no self-serve sign-up** at launch (Path B / sales-led); the Super Admin onboards each Lead into a Tenant manually.

The page is the front door to the sales-led funnel: Visitor → Lead → (manual onboarding) → Tenant.

## User Stories

1. As a visitor, I want to immediately understand what VendoPOS is from the hero section, so that I know within seconds whether it is relevant to my business.
2. As a coffee-shop owner, I want to see that VendoPOS handles a café like mine, so that I feel the product was built for me.
3. As a retailer, I want to see that VendoPOS handles medium-to-large stores, so that I trust it will scale with me.
4. As a restaurant owner, I want to see restaurant-relevant capability, so that I believe it fits my workflow.
5. As a visitor, I want to see the seven Modules (POS, Inventory, Procurement & Supply Chain, Manufacturing, Finance & Accounting, HR, CRM) explained simply, so that I understand the breadth of the system.
6. As a Filipino merchant, I want to see that receipts and reports are BIR-ready, so that I feel safe about tax compliance.
7. As a Filipino merchant, I want to see that I can accept GCash, Maya, and QRPH, so that I can take the payments my Customers actually use.
8. As a merchant with unreliable internet, I want to know the POS works offline and syncs later, so that I trust I will never lose a sale.
9. As a Filipino merchant, I want a peso-first interface, so that there is no currency confusion.
10. As a price-sensitive visitor, I want to see the three Plans and what each includes, so that I can self-qualify before talking to sales.
11. As a visitor on the Starter tier, I want to see it covers POS + Inventory at an indicative ₱999/mo, so that I know the entry price point.
12. As a growing merchant, I want to see the Business tier adds Procurement, CRM, and Finance at an indicative ₱2,499/mo, so that I understand the upgrade path.
13. As a large/complex operation, I want to see the Enterprise tier adds Manufacturing, HR, and multi-location, so that I know the ceiling of the product.
14. As an interested visitor, I want a clear "Request a Demo" call to action repeated through the page, so that I can act the moment I am convinced.
15. As a Lead, I want to submit my name, business name, email, phone, business type, and an optional message, so that the Super Admin can contact and onboard me.
16. As a Lead, I want confirmation that my request was received, so that I know to expect follow-up.
17. As a visitor, I want a "How it works" explanation (Request demo → We set you up → Run your business), so that I understand the sales-led process and that onboarding is hands-on.
18. As a cautious buyer, I want an FAQ addressing data isolation/safety, contracts, and support, so that my objections are answered before I commit.
19. As a visitor concerned about privacy, I want reassurance that each Tenant's data is fully isolated from every other Tenant, so that I trust my business data is private.
20. As a mobile visitor, I want the page to be fully responsive, so that I can browse and submit the demo form from my phone.
21. As a visitor using a screen reader, I want the page to be accessible, so that I can navigate and submit the form.
22. As a visitor who found the page via search, I want correct SEO metadata and fast load, so that the page is discoverable and pleasant.
23. As the Super Admin, I want every demo-form submission captured as a Lead, so that I have a reliable inbound pipeline.
24. As the Super Admin, I want to be notified when a new Lead arrives, so that I can follow up quickly.
25. As a visitor, I want to find legal/footer links (privacy, terms, contact), so that the business appears legitimate.
26. As a non-English-comfortable visitor, I want the option for Taglish/Filipino-friendly copy, so that the value is clear to me. *(Aspirational; see Out of Scope.)*

## Implementation Decisions

- **Stack:** Next.js (App Router) + Tailwind CSS, living in `frontend/`. Chosen for strong SEO/static rendering on the marketing page and a clear growth path into the multi-tenant dashboard app later.
- **Conversion model:** Path B (sales-led). The landing page's only behavioral action is **Lead capture**; no authentication, no billing, no tenant provisioning is built here.
- **Lead capture seam (the one real seam on this page):** the "Request a Demo" form submits to a single server-side endpoint — a Next.js Route Handler / Server Action, e.g. `POST /api/leads` — that accepts a Lead payload `{ name, businessName, email, phone, businessType, message? }`, validates it, persists it (or, for the first cut, dispatches an email/notification to the Super Admin), and returns success/validation errors. This boundary is the test seam; everything above it is presentational.
- **Page sections (build order):** Hero · Trust bar · Problem · Modules grid (7 cards) · Why VendoPOS for PH (BIR / GCash·Maya·QRPH / offline / peso) · How it works (3 steps) · Pricing (3 Plans) · FAQ · Final CTA · Footer.
- **Pricing presentation:** three named Plans differentiated by Module bundle. Starter and Business show placeholder peso figures (₱499, ₱1,499) explicitly marked as indicative/not final; Enterprise is "Contact us." Every Plan's button is a "Request a Demo" CTA — no checkout.
- **Lead delivery (first cut):** a Lead is delivered by **email/notification to the Super Admin**, not persisted to a database. No datastore is introduced by this PRD.
- **Currency & locale:** Philippine peso (₱) throughout; PH-oriented copy and trust signals.
- **No data model for Tenants yet:** the only persisted entity introduced is the Lead. Tenant/Customer/Module/Plan schemas are deferred to their own future PRDs.
- **Tenant isolation strategy is explicitly deferred** to a future ADR (shared-DB-with-tenant-id vs database-per-tenant); it does not affect this page.

## Testing Decisions

- **Test external behavior, not markup.** Do not snapshot pixels or assert on Tailwind classes. Assert on what a user/Super Admin can observe.
- **Primary seam under test — Lead capture (`POST /api/leads`):**
  - A valid payload returns success and results in a recorded/dispatched Lead.
  - Missing or malformed required fields (e.g. invalid email, empty business name) return validation errors and do **not** record a Lead.
  - Optional `message` may be omitted without error.
- **Form-level behavior test:** submitting the demo form with valid input shows the confirmation state; submitting with invalid input shows inline errors and keeps the user's input. Drive via the rendered form, asserting visible outcomes.
- **Smoke/accessibility:** the page renders its key sections and the form is reachable/labelled (basic a11y assertions).
- **Prior art:** none yet — this is the first feature. These tests establish the pattern: behavior-level tests around the highest seam (the Route Handler) plus a thin interaction test through the form.

## Out of Scope

- Self-serve sign-up, authentication, billing, and automatic Tenant provisioning (Path A) — deferred.
- The Super Admin dashboard and the Tenant dashboard.
- Any of the seven Modules' actual functionality.
- Tenant isolation implementation (future ADR).
- Real Plan pricing finalization — current figures are indicative placeholders.
- Full Filipino/Taglish localization of the UI (the page may use Taglish-flavored copy, but a language toggle is out of scope).
- A Lead-management UI for the Super Admin (initial cut may be email notification only).

## Further Notes

- The Philippine-specific value props (BIR-ready, GCash/Maya/QRPH, offline-first, peso-first) are the core differentiation against Square/Lightspeed and should be the most prominent non-hero content.
- All landing copy must reinforce, never blur, the `CONTEXT.md` vocabulary: a Merchant subscribes; a Tenant is isolated; a Customer is the shopper; a Lead is a not-yet-Tenant.
- When the backend begins, the first ADR to write is the Tenant isolation strategy.
