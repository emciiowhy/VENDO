---
name: taste-skill
description: VENDOPOS parameterization of the taste-skill design engine. Drives every redesign step (Landing, Login, Owner Dashboard, POS) with our locked dials, design metrics, and hard constraints. Read this before restyling any surface.
---

# taste-skill — VENDOPOS configuration

This is **our parameterization layer** over the upstream taste-skill design engine
(Leonxlnx/taste-skill). The upstream skill supplies the "anti-slop" layout/type/motion
discipline; **this file constrains it to VENDOPOS's existing design system.** When the two
ever conflict, **this file wins.**

> Engine install: the upstream skill is installed under `.claude/skills/` (via `npx skills add`,
> redesign/frontend variant). Always apply it **through** the dials and constraints below.

The uplift comes from **layout, hierarchy, type rhythm, spacing, density, and micro-motion** —
never from new palettes, new colors, or new dependencies.

---

## Per-surface dials

| Surface | Route | DESIGN_VARIANCE | VISUAL_DENSITY | Intent |
|---------|-------|:---:|:---:|--------|
| **Landing** | `/` | **8 / 10** | **3 / 10** | Editorial variance, spacious luxury padding. Sell the product. |
| **Login** | `/login` | **4 / 10** | **3 / 10** | Calm, focused, trust-building. No theatrics around credentials. |
| **Owner Dashboard** | `/dashboard` | **4 / 10** | **8 / 10** | Structured desktop data-reading. Dense, calm, scannable ledgers. |
| **POS Terminal** | `/pos` | **3 / 10** | **7 / 10** | Predictable muscle-memory placement; **hybrid touch-first** — generous, reliably tappable button/card boundaries on tablet. |

`MOTION_INTENSITY` is **fixed low** for all surfaces (see Motion budget). Variance/density vary
per the table; never raise POS or Dashboard variance for novelty — predictability and reading
speed win on operational surfaces.

---

## Hard constraints (non-negotiable)

### 1. Token-only palette
- Every color resolves through existing semantic tokens: `--color-ink` / `--color-ink-soft` /
  `--color-ink-faint`, `--color-brand-50..700`, `--color-accent-*`, `--color-amber-*`,
  `--color-paper`, `--color-surface` / `--color-surface-2`.
- **Forbidden in any changed file:** raw hex colors, and Tailwind palette classes
  `zinc-*`, `slate-*`, `gray-*`, `neutral-*`, `indigo-*`, `blue-*`, `emerald-*` used as literal
  colors. Use the semantic token utilities instead.
- Never hardcode a brand ramp stop — read `--color-brand-*`. The ramp math lives in
  `frontend/lib/theme.ts` and must keep working for any tenant hue.

### 2. Preserve theming + dark mode
- Tenant theming is scoped to `[data-vp-theme]`; dark mode is the `.dark` ancestor strategy.
  New themed surfaces (mockups included) must render **inside a `[data-vp-theme]` root** so
  accent + dark bindings are exercised.
- Marketing/Login intentionally do **not** use tenant theming — they stay on global brand tokens.
  Do not introduce `[data-vp-theme]` there.

### 3. CSS-keyframe motion budget (no runtime animation deps)
- **No new dependencies.** No `motion`, `framer-motion`, `gsap`, etc.
- Use native Tailwind arbitrary transitions + hand-authored CSS keyframes in `app/globals.css`.
- **Transforms only** for animation: `translate`, `scale`, `opacity`. Never animate layout
  properties (width/height/top/left/margin) — no layout thrash.
- **Duration ceiling 150–200ms.** Subtle micro-interactions that make the workspace feel snappy
  and light. Reuse the existing vocabulary (`reveal`, `slide-over`, `vp-scale-in`) before adding
  new keyframes.

### 4. Container / presentational split — logic frozen
- `PosTerminal.tsx` and `MerchantHome.tsx` remain the **stateful containers.** All VAT/discount
  math, shift hooks, barcode/scanner handlers, thermal-print triggers, payment logic, tier-gating,
  and data fetching **stay in the parent, untouched.**
- We only extract **presentational** layout segments into child components that receive existing
  state/handlers as **explicit props.** No business function is moved, renamed, or refactored.
- Result: large visual diff, ~zero behavioral diff — so parity verification stays clean.

### 5. POS touch ergonomics
- Interactive targets (product cards, payment buttons, qty steppers, numeric keys) render
  **≥44px** at the register breakpoint, with deliberate padding so taps land reliably on a tablet.
- Density 7/10 means information-rich, **not** cramped — density is achieved with hierarchy and
  spacing rhythm, not by shrinking tap targets.

---

## Design metrics (reuse, don't reinvent)

All defined in `frontend/app/globals.css`:

- **Type ladder:** `--text-cap` (11px labels), `--text-fine` (12px meta), `--text-note` (13px),
  `--text-title` (14.4px headers), `--text-stat` (28.8px KPI), `--text-hero` (38.4px),
  `--text-feature` (48px). Each carries baked line-height + tracking — map to these, don't eyeball.
- **Tracking:** `--tracking-tightest: -0.035em` for the ledger effect.
- **Radius:** `--radius-xl2: 1.125rem`.
- **Shadows (roles):** `--shadow-soft`, `--shadow-card`, `--shadow-btn` (brand-tinted).
- **Utilities:** `.glass`, `.grid-bg`, `.hairline` / `.hairline-strong`, `.field-input`,
  `.scrollbar-none`.
- **Font:** Plus Jakarta Sans (`--font-jakarta`).

New shared primitives may be added to `globals.css` **only** within these conventions
(token-referencing, no hardcoded colors) — e.g. a tap-target utility or a ≤200ms stagger keyframe.

---

## Workflow (mockup-first for monoliths)

1. **POS** and **Dashboard content** get a **stateless mockup first**
   (`PosTerminalMock.tsx`, `MerchantHomeMock.tsx` under `frontend/app/preview/*` — an unlinked
   route, **not** `_preview` since underscore folders are non-routable in Next 16 — themed root,
   dummy data, **no hooks**) → audit dark/accent/density/ergonomics + `__shots` → sign-off →
   port presentational children into the real container → delete mock.
2. **Dashboard shell** (`DashShell.tsx`, `merchantNav.ts`), **Login**, and **Landing** get
   **direct inline restyle** (minimal frozen logic).

## Definition of done (per surface)
- Token-only (grep clean of forbidden colors), dark + tenant-accent verified live.
- `__shots` before/after reflect intended layout changes only.
- For POS/Dashboard: behavior parity smoke passes (logic unchanged).
- Lint + typecheck + production build pass.
