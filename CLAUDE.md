# CLAUDE.md — RIVEN

This file tells Claude how to work on RIVEN. Read it first.

The full background (tech stack, routes, schema, infra) is in [HANDOFF.md](./HANDOFF.md). This file is the **design and voice rules** only.

The emotional core — what every copy line, screen, and feature must feel like — is in [BRAND.md](./BRAND.md). Read it before writing for RIVEN. The test for every decision: **"Does this feel like peaceful discipline?"** The tagline that compresses it: **"Steady wins."**

---

## What RIVEN is

A coaching app for Black women 35-55 doing body recomposition. The coach is Sean Williams. Mobile-first PWA.

The whole product feels like Sean is in it. That matters more than any single feature.

---

## The look

We call it "luxurious essentialism." Quiet, premium, lots of space. Not loud. Not sporty. Not a Silicon Valley dashboard. Think a high-end journal more than a fitness tracker.

### Colors — only use these four

Don't invent new hex codes. Don't add "just a little blue."

- **Cream** `#FAF7F2` — page background. Everything sits on cream.
- **Charcoal** `#1A1A1A` — main text and main buttons.
- **Gold** `#C9A961` — accents. Borders, highlights, attention moments. Not big areas.
- **Sage** `#7C9A7E` — confirmation. "You did it" green for check-in done and completion states.

Tailwind classes: `bg-cream`, `text-charcoal`, `bg-gold`, `text-sage`, etc. Just use the names.

For warnings, use the existing `soft-red` token (already in tailwind config). Don't import standard `red-500` unless it's a tiny unread-count dot.

### Fonts

- **DM Serif Display** — headlines, big numbers, the wordmark. Class: `font-display`.
- **Plus Jakarta Sans** — everything else. Class: `font-body`.

The serif does the heavy lifting. Headlines should feel quiet and confident — never bold or loud. Lowercase labels with wide tracking (`tracking-widest uppercase`) is the look for eyebrow text.

### Spacing — use existing tokens

Don't make up pixel values. Don't use `p-4` when there's a named token.

- `px-container-mobile` / `px-container-desktop` — page horizontal padding
- `px-gutter` / `gap-gutter` — inside cards and grids
- `space-y-section-gap` — vertical rhythm between sections

**Alias gotcha:** `px-container-mobile` and `container-padding-mobile` are the same thing. Both aliases must stay in tailwind config — removing either silently breaks every page's mobile padding.

---

## How Sean talks

Direct. Warm. No preamble. No shame. No therapy clichés. No clean-eating moralizing.

Sean sounds like a smart older brother who gives it to you straight — not your therapist, not your cheerleader.

### Good

- "Protein's on point. Stack more meals like this."
- "You're not failing — we just need real data."
- "That's a clean plate. Bump the chicken to 6oz next time and you're tracking."
- "Light day on the log. What did lunch look like?"

### Bad

- "Wow, amazing meal! I'm so proud of you."
- "Great question!"
- "Be patient with yourself."
- "Try to make healthier choices next time."
- Any participation-trophy energy.

### Signature phrases — use sparingly

- "Lock it in."
- "Real talk:"
- "That's data, not a problem."
- "We just need to clamp down a little."

### Never say

- "I'd be happy to help!"
- "Great question!"
- "I understand how you feel"
- "It's important to remember…"
- Generic motivational quotes
- "Stay strong" / "You got this" / any cheerleader line

---

## Component patterns we've already built

When building something similar, match these — don't invent new patterns.

- **Coach message chip (top-right of dashboard):** translucent white glass (`bg-white/55 backdrop-blur-xl`) with gold breath halo (`riven-coach-breath`) when unread. Solid charcoal pill when read.
- **Sticky log pill (above bottom nav):** charcoal pill normally. Gold + soft pulse (`riven-pulse-soft`) when she's behind on logging.
- **Reminder cards:** `bg-gold/15 border border-gold/60`, with `material-symbols-outlined` arrow on the right, time-aware copy on the left.
- **Big primary CTAs:** `block w-full bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-95`.
- **Secondary CTAs:** same shape, `bg-transparent text-charcoal border border-charcoal`.
- **Sean speech bubble (onboarding):** small Sean photo + `bg-secondary-container/40 border border-gold/40 rounded-2xl rounded-tl-sm` bubble next to it.

---

## Motion rules

- Soft pulses, not heartbeats. We breathe. We don't strobe.
- Every animation must respect `prefers-reduced-motion: reduce` — add the `@media` override that sets `animation: none`. See existing keyframes in `globals.css` for the pattern.
- Page transitions feel calm, not snappy.
- No bouncy easings. `ease-in-out` is the default; `linear` is fine for spinners.

---

## Gotchas (these have bitten us — don't repeat them)

1. **Don't put `redirect()` inside `try/catch`.** It throws `NEXT_REDIRECT` and the catch swallows it, leaving the page rendering whatever was below. Layout role gates put redirects OUTSIDE try/catch.

2. **`"use server"` files can only export async functions.** Don't export constants from server-action files — it fails the production build. Move constants to a plain `.ts` module.

3. **Tailwind `calc()` arbitrary values need underscores around `+`/`-`.** Use `top-[calc(env(safe-area-inset-top)_+_12px)]`. Without the underscores Safari drops the entire property.

4. **R2 needs `forcePathStyle: true`.** Already set in `src/lib/r2.ts`. Don't remove it — virtual-host-style signed URLs are flaky on R2.

5. **Welcome page (`/`) stays out of ClerkProvider.** It's the only edge-cached page and shouldn't depend on Clerk's SDK loading. Don't use `useUser()` or `useAuth()` there. For "redirect signed-in users" we cookie-sniff in `welcome-auth-redirect.tsx`.

6. **Coach name is hardcoded to "Sean".** Never use `Profile.name` for the sender label on COACH-kind ChatMessages — Sean's name can leak into a client account if he ever tested with one.

7. **AI-message vs coach-message isolation.** `/chat` filters `kind: "AI"`. `/messages` filters `kind: "COACH"`. Don't show both in the same view.

8. **Calorie estimates overestimate 20% by default. Stated numbers from the client are gospel.** When she names a specific calorie count ("the label said 290") the AI uses that number 100% of the time — no buffer, no implausibility override. Otherwise the +20% flat buffer applies. Rules in `src/lib/anthropic.ts` and `src/lib/chat-prompt.ts`; the cultural food baselines in both files are already pre-cushioned at the 20% level.

---

## How to work on RIVEN

When starting a session:

1. Read this file (you're doing it)
2. Skim [HANDOFF.md](./HANDOFF.md) for tech stack, routes, env vars
3. Look at the closest existing component before building a new one
4. Match brand tokens — never invent colors, fonts, or spacing values
5. Match Sean's voice in every coach-side string
6. After any change, typecheck before committing (`npx tsc --noEmit`)

When writing new components:

- Start with the closest existing component as a template
- Use brand tokens for everything (no hex codes in className)
- Add `prefers-reduced-motion: reduce` overrides if you animate anything
- Keep copy in Sean's voice — never therapy clichés, never moralizing

When in doubt:

- Cream backgrounds, charcoal text, gold accents only when something needs attention.
- Quiet > loud. Spacing > decoration.
- Short copy > long copy. One concrete suggestion > three vague ones.
