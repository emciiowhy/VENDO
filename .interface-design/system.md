# VendoPOS — Interface Design System

Durable craft decisions for the back-office surfaces (`/admin`, `/dashboard`, and
the ERP modules). Tokens live in `frontend/app/globals.css` (Tailwind v4 CSS-first
`@theme`). When a value here defines a rule, follow it instead of re-deriving.

## Direction & feel

**"Ledger, not dashboard."** The product is a Filipino merchant's books — money is
the subject, structure stays quiet, hierarchy is obvious at a glance. The identity
lives in the **canvas temperature**, not decoration:

- **Light** = warm ivory ledger paper (`--color-paper: #f6f4ee`); white cards sit crisp on top.
- **Dark** = neutral charcoal night (`--color-paper: #101218`, `--color-surface: #181b23`), **not** blue-navy.
- **Brand blue**, deepened/de-neoned (`--color-brand-500: #2b50ea`), reads as ink/trust and *pops* against both neutral grounds.
- **Accent emerald** (`--color-accent-500: #0aa372`) = settled money. Blue = platform/infra/navigation.

Swap test: you can't substitute generic SaaS blue back without losing the warm-ground identity.

## Color = meaning (not decoration)

- **Emerald/accent** → money & health: revenue figures, MRR plan bars, positive deltas, uptime, top-seller bars.
- **Brand blue** → the platform, infrastructure, navigation, primary actions (DB pool meter, active nav, "Open register").
- **Rose** → negative/destructive/hot. **Amber** → warning/low-stock.
- One accent per purpose. Do **not** alternate brand/accent on tiles for visual variety — identical affordances get identical treatment (colour reveals on hover).

## Depth strategy

Borders-led, with **shadow used to express hierarchy** (not applied uniformly):

- Standard card: `bg-surface hairline shadow-card`.
- **Focal panel** (the one thing the screen is about — MRR card, Revenue-velocity panel): `hairline-strong shadow-soft`.
- Flat/scan bands (telemetry strip): `hairline` only, no shadow.
- Hover lift for links/tiles: `hover:hairline-strong hover:shadow-soft`.
- Dark mode leans on borders (shadows barely register); the hairline tokens already retint.

## Borders — two weights

- `hairline` — quiet default (card edges, dividers): `rgba(11,18,32,0.07)` / dark `rgba(255,255,255,0.09)`.
- `hairline-strong` — emphasis (focal panels, hovered tiles): `rgba(11,18,32,0.12)` / dark `rgba(255,255,255,0.16)`. Variants: `-strong-t`.

## Surfaces (elevation)

`paper` (canvas) → `surface` (cards) → `surface-2` (dropdowns/popovers/floating figure).
Light leans on shadow for the top step; dark steps a few % lighter
(`#181b23` → `#20242e`). Inputs are inset (`field-input`, slightly darker than surroundings).

## Type scale — use these, never `text-[12.5px]` literals

Defined in `@theme`; line-height baked in, tracking baked into the display steps.

| Token | Size | Use |
|------|------|-----|
| `text-cap` | 11px | uppercase labels, badges, tags |
| `text-fine` | 12px | metadata, captions, fine print, card descriptions |
| `text-note` | 13px | secondary body, supporting copy |
| (base) | 14px | default body, nav, buttons |
| `text-title` | 1.15rem | page/header titles (tracking-tightest baked) |
| `text-stat` | 1.8rem | KPI figures (leading-1 + tightest baked) |
| `text-hero` | 2.4rem | overview headline figures |
| `text-feature` | 3rem | the single dominant figure on a screen |

Hierarchy = size **+ weight + tracking + opacity**, never size alone. Text colours:
`text-ink` / `ink-soft` / `ink-faint` (primary/secondary/metadata). Numbers always `tabular-nums`.

## Spacing

4px grid. Section rhythm `space-y-7` (28px). Card padding `p-5` (standard) / `p-6`
(focal cards). KPI/tile gaps `gap-4`; panel-row gaps `gap-5`. Radius: `rounded-xl2`
(1.125rem) cards, `rounded-[10px]`/`[12px]` controls & icon tiles.

## Composition patterns

- **Every screen needs a focal point.** Don't stack equal grids. Lead with the one
  figure/panel the user came for (larger, `hairline-strong shadow-soft`), support it,
  then a denser band, then navigation. Reference: admin Overview = MRR feature (2/3) +
  Active Merchants (1/3) → telemetry strip → "Jump to". Merchant home = KPI row →
  velocity (2/3 focal) + low-stock (1/3) → payment/top-sellers/books.
- **Rhythm over monotone**: read → read → scan → launch.
- **Icon tile** convention: `w-8 h-8`/`w-10 h-10` rounded square, `bg-brand-50 text-brand-600`,
  → `group-hover:bg-brand-500 group-hover:text-white`. Tint by meaning (money=accent) only when it encodes something.
- **Every interactive element** needs default/hover/active/focus/disabled; data needs loading/empty/error (skeletons + honest empty copy already in use).

## Shared frame

`DashShell` (`frontend/app/components/dash/DashShell.tsx`): 260px sidebar, same bg as
canvas + `hairline-r` separation (no separate "sidebar colour"), sticky `glass`
top bar carrying page title + identity. Reused by `/admin` and `/dashboard`.

## Modal & overlay motion (one entrance, no exceptions)

Every dialog/overlay animates in the same way — a missing entrance reads as drift.

- **Centered modals**: scrim gets `overlay-backdrop` (fade), card gets `overlay-card`
  (pop-in). Applies whether the card is a `div` or a `form`.
- **Right-anchored drawers**: scrim gets `overlay-backdrop`; the panel gets
  `slide-over` (translateX in). Reference: `SubscribersDrawer`, `LeadsMatrix`.
- **Animated exit** (`closing` + `.closing`) is the register-overlay pattern via
  `useDismiss` in `PosTerminal` (Checkout/Receipt/Discount/Void). `useDismiss` also
  binds **Esc → dismiss**, so every register overlay closes on Esc like the
  back-office `ConfirmDialog`. Back-office modals are entrance-only (instant unmount)
  — that's the accepted baseline, don't half-build an exit.
- **Exception**: the `DashShell` mobile-nav sidebar is a transform-transition nav
  drawer, not a modal — its scrim stays plain.

## Register checkout micro-patterns

- **Symmetric money chips**: cash short/over render mirrored chips — `bg-accent-50
  text-accent-600` "Change due" vs `bg-rose-50 text-rose-600` "Short by". Never show
  one without its counterpart; a short amount is a stated number, not a silent
  disabled button.
- **Enter settles**: the *Cash received* and *e-wallet reference* inputs charge on
  Enter (guarded by the same condition as the Charge button) so a sale completes
  without leaving the keyboard.

## Verifying changes visually

Both back-office surfaces are auth-walled (`useSession` → `/auth/me`). Pattern used
this session: mint a sid-less session JWT from the DB (accepted by `requireAuth`),
drive Playwright with the cookie + `localStorage vendopos_theme`, wait on a
data-rendered selector (not a static one) before shooting, capture light + dark.
See `frontend/__shots/capture.mjs`.
