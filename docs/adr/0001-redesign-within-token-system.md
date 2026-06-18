---
status: accepted
date: 2026-06-19
---

# Redesign within the existing token system

## Context & decision

In June 2026 we ran a four-phase UI redesign of the landing page, login, owner/merchant
dashboard, and the POS register, driven by the taste-skill design engine (parameterised in
`.claude/skills/taste-skill.md`). VENDOPOS already has a deliberate design system — semantic
light/dark tokens (`--color-ink/brand/accent/paper/surface`), a per-tenant accent ramp derived
from one hex and scoped to `[data-vp-theme]`, a structural merchant theme config, and a `.dark`
retint. We decided the redesign would **operate entirely within that system**: it sharpens
layout, hierarchy, type rhythm, spacing, density, and micro-motion, but introduces no new colour
language, no new runtime dependency, and no business-logic change. taste-skill supplies the craft;
the token contract supplies the guardrails — and the guardrails win when they conflict.

This is worth recording because a future contributor reading the diff (thousands of changed lines,
~zero behavioural change) will reasonably ask why the redesign was so constrained — and because
reversing any of the three constraints below is expensive and would quietly break tenant theming,
dark mode, or checkout performance.

## The three constraints

1. **Token-only design authority.** Every colour resolves through the semantic `--color-*`
   tokens; no raw hex or `zinc`/`slate`/`indigo` literals in changed files (the pass actually
   *removed* leaks — `dark:bg-[#0b1220]`, `hover:bg-black`). This is what lets a tenant's accent
   recolour every surface and keeps `.dark` working; one bespoke colour would punch a hole in both.

2. **CSS-keyframe-only motion budget — no runtime animation library.** New micro-interactions
   (`.press`, `.lift`, `.rise`, `--ease-snap` in `globals.css`) are hand-authored CSS: transforms
   only (`translate`/`scale`/`opacity`), ≤200ms, reduced-motion-guarded. We deliberately did **not**
   add `motion`/`framer-motion` — to protect the POS checkout's client bundle and runtime and keep
   SSR trivial. The marketing `.reveal`/marquee stay the page's one slower signature layer.

3. **Container / presentational freeze on the monoliths.** `PosTerminal.tsx` (~2k lines) and
   `MerchantHome.tsx` remain the stateful containers — VAT math, the scan batcher,
   payment/shift/thermal logic, data hooks — untouched. The redesign only restyled markup and
   extracted presentational children that receive existing state via explicit props. The visual
   diff is large and the behavioural diff is ~nil, which is what made parity verifiable.

## Considered and rejected

- **A fresh visual identity, re-tokenised afterward.** Rejected: more rework and a real risk of
  fighting the brand-ramp maths; the uplift didn't need a new palette.
- **A runtime motion library for richer choreography.** Rejected: bundle/runtime cost on an
  operational register outweighs the gain; CSS keyframes cover our ≤200ms budget.
- **Refactoring the monoliths' logic during the restyle.** Rejected: mixing a risky logic refactor
  into a large visual diff destroys reviewability and the parity guarantee.

## Consequences

- Any **new themed surface must sit under a `[data-vp-theme]` root** and read `--color-*` tokens;
  never hardcode a brand stop — the ramp maths live in `lib/theme.ts`.
- New motion stays within the keyframe budget (transforms, ≤200ms, reduced-motion guard). Reach for
  the existing `.press`/`.lift`/`.rise` before authoring more, and **never stack `.lift` + `.press`
  on one element** — their transforms collide (and `.rise` uses `backwards` fill, not `both`, for
  the same reason).
- Marketing/login deliberately stay **off** `[data-vp-theme]` (global brand tokens, light-mode only).
- The throwaway `/preview/pos` and `/preview/merchant` audit routes are not part of the system and
  should be deleted once parity is verified.
