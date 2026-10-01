# HR Employee ↔ Cashier till-access bridge

## Status

accepted

## Context

A Tenant's workers are modelled as **two separate records**: an **Employee** (the `employees` HR record — Enterprise-only) and a **Cashier** (a `users` row with `role='CASHIER'` + PIN — Business+). They are joined by an optional `employees.user_id` link that already drives auto-attendance and the performance report, but nothing in the UI ever sets it. As a result, adding someone in HR does not give them a till login, and they never appear in the live Duty roster ("who's on duty"). The two creation paths produce orphans on both sides.

HR is Enterprise-only while Cashiers are Business+, so the standalone "Add cashier" path cannot be removed — Business Tenants have no HR to provision from.

## Decision

Keep the two records and the `employees.user_id` link; add a **bridge** on Enterprise only, as an additive layer:

- From an Employee, **Grant till access** either provisions a new Cashier login (PIN + default float) or links an existing unlinked ("orphan") Cashier, setting `employees.user_id`.
- HR surfaces orphan Cashiers as "unlinked till logins" the owner can **adopt** into an Employee record.
- The Business-tier Cashiers console ("Add cashier") is unchanged.

**Lifecycle coupling:** separating/deactivating an Employee auto-disables the linked Cashier login (status `disabled`), so a departed worker cannot ring up sales. Deleting a linked Cashier unlinks it (`user_id → NULL`) rather than cascading, preserving the HR record and attendance history.

## Considered alternatives

- **Link-only** (dropdown to attach an existing cashier): rejected — new logins would still only be born in StaffMatrix, leaving the two-step gap that produces orphans.
- **Auto-create both ways (always 1:1):** rejected — it couples the Business-tier Cashiers console to the Enterprise HR module and forces an Employee record onto every Business cashier, which have no HR.
- **Independent lifecycles:** rejected — a separated employee would retain a working till login until manually disabled, a sales-integrity and security gap.

## Consequences

- One real person is represented by two linked records on Enterprise; the link is the source of truth for "this employee can work the till."
- Deactivating an Employee has a side effect on POS sign-in — surprising unless you know this ADR.
- Orphan cashiers created before the bridge remain valid and can be adopted later; no backfill/migration is forced.
