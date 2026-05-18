# RIVEN — Session Handoff Context

Paste this whole document into a new chat with a coding agent (Claude Code, etc.) to give them complete context. Last updated 2026-05-17, end of the "post-launch polish" session (proactive Sean messaging engine, per-item meal breakdown, daily reset, streak celebrations).

Also read `CLAUDE.md` at the repo root — it captures the design system and Sean-voice rules in a form that auto-loads into every Claude Code session.

---

## Working style with the coding agent

**When Sean asks for UI/UX ideas, illustrate with code, not just prose.** Any time he asks "what are some ideas for...", "how should X look?", "what are my options for the dashboard...", each option in your response should include a short JSX snippet (5-15 lines, using existing brand tokens — cream/charcoal/gold/sage, font-display/font-body, existing component patterns) showing the actual layout. He thinks visually and makes faster, better decisions when he can *see* the shape. Prose-only bullet lists force him to translate words to visuals in his head, which is slower and loses fidelity.

The code illustrates *what* the option looks like; keep the one-line tradeoff and final recommendation in prose. This rule does NOT apply when he asks for a build directly (the visual is implied in the code being written) or for backend/architecture questions.

---

## What RIVEN is

Premium mobile-first coaching app for Black women 35–55 in a body-recomposition program. Built around one coach (Sean Williams) and his clients. Brand: luxurious essentialism — cream backgrounds, charcoal text, gold/sage accents, DM Serif Display headlines, Plus Jakarta Sans body. Direct/no-BS voice, never preachy.

**As of 2026-05-14, RIVEN is LIVE.** Real Stripe live mode, real cards, real Clerk production at clerk.rivenmethod.com. $50/mo subscription with a 7-day trial. The 8 original beta clients are comped for life via `subscriptionStatus="comped"` — they bypass the paywall.

## Where it lives

- **Production:** https://rivenmethod.com (also `rivenaiapp-production.up.railway.app`)
- **GitHub:** https://github.com/lamper2019-cyber/rivenaiapp
- **Local:** `/Users/youngrxse/CLaude code/riven-app`
- **Coach:** Sean → email `lamper.2019@gmail.com` (auto-promoted to `role: COACH` via `COACH_EMAIL` env var)

## Tech stack

- Next.js 14.2.35 App Router, TypeScript
- Tailwind with brand tokens
- **Clerk v5 — LIVE keys (`pk_live_*` / `sk_live_*`)** as of 2026-05-14. Production instance at `clerk.rivenmethod.com` (custom domain via CNAMEs). Google OAuth configured with custom credentials in Google Cloud Console (project: `riven-496301`).
- Prisma 6 + Postgres on Railway. Migrations apply on every container boot via `prisma migrate deploy` in the `start` npm script.
- Anthropic Claude (`claude-sonnet-4-6`) for chat, meal logging, voice rewrite, Monday check-in generation
- OpenAI `gpt-4o-mini-transcribe` for voice memos
- **Stripe** (live mode) — Stripe Billing for subscriptions, Stripe Checkout for hosted payment, Stripe Customer Portal for self-service. API version pinned to `2026-04-22.dahlia`. Stripe takes 2.9% + 30¢ per charge.
- Cloudflare R2 for media (presigned PUT uploads, public reads)
- Cloudflare in front of rivenmethod.com (orange cloud proxied). Clerk DNS records (clerk, accounts, clkmail, clk._domainkey, clk2._domainkey) are DNS-only (gray cloud) on the same zone.
- Web Push (VAPID)
- PWA installable, service worker stale-while-revalidate for `/`
- `sharp` for native image optimization
- `critters` for inline critical CSS (`experimental.optimizeCss: true`)

## Infra services on Railway

Project: `bubbly-perception` / production.

1. **`rivenaiapp`** — the Next.js app, custom domain rivenmethod.com
2. **`Postgres`** — DB, has volume `postgres-volume`
3. **`sunday-checkin`** (originally `devoted-integrity`) — Sunday cron, fires `0 14 * * 0` UTC (Sun 9 AM CDT). Image-based service, runs `sh -c 'curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://rivenmethod.com/api/cron/sunday-reminder'`
4. **`monday-checkin`** (the original service got stuck "Deploying" with multi-region misconfig and was replaced by a duplicate of `sunday-checkin` mid-session) — Monday cron, fires `0 12 * * 1` UTC (Mon 7 AM CDT). Same image-based pattern, hits `/api/cron/monday-checkin`.
5. Both cron services reference `CRON_SECRET` via `${{rivenaiapp.CRON_SECRET}}` so the secret stays in one place.

**Region & replica setup for crons:** single region only. Hobby tier doesn't support multi-region (Railway will reject the deploy with "DNS points to prohibited IP" or "multi-region requires Pro"). If a cron ever fails to deploy, check Settings → Scale and remove any second region.

**Migrations on deploy:** the `start` script in `package.json` is `prisma migrate deploy && next start`. This means every container boot checks for pending migrations and applies them before serving traffic. Critical — without it, schema changes never reach production. See commit `12bda21`.

## Cloudflare config

- Orange-cloud proxy on rivenmethod.com → Railway
- Cache Rule "Cache welcome page" matches `(http.host eq "rivenmethod.com" and http.request.uri.path eq "/")`:
  - Cache eligibility: Eligible
  - Edge TTL: Ignore cache-control, use 1 hour
  - Browser TTL: Override origin, use 1 hour
- Origin headers (set in `next.config.mjs`) also tell CF to cache `/` and long-cache `/_next/static/*` immutable

## Key env vars (Railway)

- `DATABASE_URL` — Postgres
- `CLERK_SECRET_KEY` (sk_live_*), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live_*) — production Clerk keys
- `ANTHROPIC_API_KEY` — used by chat + meal logging + rewrite + Monday check-in
- `OPENAI_API_KEY` — Whisper transcription
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`
- `CRON_SECRET` — `ce3fb...` (this string has been in chat history; rotate when convenient — Sunday/Monday cron services pick up new value automatically via `${{rivenaiapp.CRON_SECRET}}` reference)
- `COACH_EMAIL` — `lamper.2019@gmail.com`
- `STRIPE_SECRET_KEY` (sk_live_*) — Stripe live secret key. Original `sk_live_*` was exposed in chat early in this session and was rolled; the current value is fresh.
- `STRIPE_PUBLISHABLE_KEY` (pk_live_*) — Stripe live publishable. Safe to be public-ish; meant for client-side use. Note: the env var name is NOT `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` because the current Checkout flow is server-side redirect only (no client SDK). If we ever add Stripe Elements on the client, rename it.
- `STRIPE_PRICE_ID_MONTHLY` (price_*) — the live RIVEN App $50/month price ID.
- `STRIPE_WEBHOOK_SECRET` (whsec_*) — Stripe webhook signing secret for `/api/stripe/webhook`. Verified per request.
- `NEXT_PUBLIC_APP_URL` — optional. Stripe Checkout success/cancel URLs and Customer Portal return URL fall back to `https://rivenmethod.com` if unset.

**Removed during go-live:** `NODE_OPTIONS=--max-http-header-size=32768` was a dev-keys-only workaround for Clerk handshake — gone now that we're on live keys.

## Schema (Prisma) — key tables

- `User { id, clerkId, email, role: CLIENT|COACH, stripeCustomerId, subscriptionStatus, subscriptionCurrentPeriodEnd, createdAt }`
  - Stripe fields added via migration `20260513170000_add_stripe_subscription_fields`.
  - `stripeCustomerId` is unique; set lazily on first Checkout.
  - `subscriptionStatus` mirrors Stripe values (`trialing | active | past_due | canceled | incomplete | incomplete_expired | unpaid`) PLUS our own value `"comped"` for beta clients who get the app free for life. The webhook never overwrites a `"comped"` status.
  - `subscriptionCurrentPeriodEnd` is read from `subscription.items.data[0].current_period_end` (Stripe API 2026-04-22.dahlia moved it off the subscription itself).
- `Profile { userId, name, age, heightInches, startWeight, currentWeight, goalWeight, activityLevel, cycleStatus, phase, maintenanceCalories, cutCalories, weeklyBudget, proteinFloor, onboardedAt, tutorialStep }`
  - `tutorialStep` migration `20260511135659_add_tutorial_step`. Default 5 (done). New profiles explicitly set 0.
  - **Calorie targets** computed via `calculateTargets()` in `src/lib/calculations.ts`. Cut = `max(maintenance × 0.77, 1400)` — 23% off maintenance with a 1400 floor so petite clients don't get pushed into under-eating territory. Protein floor = `max(goalWeight × 0.8, 130)`. Female Mifflin-St Jeor by default.
- `MealLog { userId, description, shortName, calories, protein, fat, carbs, aiResponse, items, processedFlag, flagReason, createdAt }`
  - `shortName`, `processedFlag`, `flagReason` added via migration `20260514040000_meal_log_shortname_and_flag`.
  - `items` (Json) added via migration `20260514130000_meal_log_items` — per-item breakdown `[{ name, calories, protein, fat, carbs }, ...]`. Drives the per-item pill display under each meal card on /log. Tap a pill → pre-fills the textarea with just that item's name for selective re-logging. Nullable on legacy rows; new logs always populate.
  - `shortName` is the 3-5-word AI-extracted label used by the "Today" section on /log. Nullable for legacy rows pre-migration; the UI falls back to a truncated description.
  - `processedFlag` + `flagReason` drive the soft-red "Heads up" pill on the result card. Only set true when the meal contains ultra-processed / refined / seed-oil-fried / sugary stuff in noticeable quantity.
- `DailyTotals { userId, date, totalCalories, totalProtein, totalFat, totalCarbs, totalSteps }` — unique on (userId, date)
  - **`date` is keyed by `startOfCentralDay()`** from `src/lib/dates.ts` — the UTC instant of midnight Central time. Historical rows (pre-commit `3efd4e2`) were keyed at server-local UTC midnight; those become mis-bucketed after the fix but are not deleted. New writes and reads agree.
- `WeeklyCheckIn { userId, weekStart, weight, waist, photoFrontUrl, photoSideUrl, menuAdherence, sleepAvg, cycleStatus, stress, winsAndStruggles }` — unique on (userId, weekStart)
- `ContentSubmission { userId, week, promptText, videoUrl, photoUrl, createdAt }`
- `ChatMessage { userId, role: USER|ASSISTANT, kind: AI|COACH, senderUserId?, content, imageUrls[], createdAt }`
  - `kind=AI` lands in `/chat` (RIVEN AI thread)
  - `kind=COACH` lands in `/messages` (coach inbox); fires push, triggers home-screen gold "Message from Sean" badge
- `PushSubscription { userId, endpoint (unique), p256dh, auth, userAgent }`

**Migrations folder** (in order, newest at top):
```
20260514130000_meal_log_items                 -- MealLog.items JSON column for per-item breakdown
20260514040000_meal_log_shortname_and_flag    -- shortName / processedFlag / flagReason
20260514010000_comp_initial_beta_clients      -- one-time UPDATE: marks the 8 original beta clients as comped
20260513170000_add_stripe_subscription_fields -- stripeCustomerId / subscriptionStatus / period end
20260511135659_add_tutorial_step              -- tutorialStep
20260510013233_add_coach_messages_and_push    -- COACH ChatMessages + PushSubscription
20260510004113_init                           -- everything else
```

## What's built (route map)

### Public
- `/` — welcome page (static, edge-cached via Cloudflare). Signed-in users auto-redirect to `/dashboard` via a tiny cookie-sniff in `welcome-auth-redirect.tsx` (looks for `__client_uat` / `__session`). CTAs are equalized: "Sign in" (filled charcoal pill) + "I'm new — start here" (outlined). Welcome stays out of `ClerkProvider` so the page stays statically renderable.
- `/pricing` — public pricing page added to middleware allowlist. Three states based on auth/subscription: signed-out → "/sign-up" CTA; signed-in without active sub → server action triggers Stripe Checkout; signed-in with sub → "you're on RIVEN, open dashboard" link.
- `/sign-in`, `/sign-up` — Clerk hosted components on live keys. Google OAuth works (custom Google Cloud OAuth client ID configured in Clerk → SSO connections).

### Onboarding flow
- `/onboarding` — step-by-step 8-slide flow in Sean's voice, NOT a single form anymore. Sean monogram (charcoal circle, gold serif "S") sits next to each prompt. Visual inputs: range slider for age/weight/goal-weight, +/− steppers for height (feet/inches), tap-card grid for activity level, tap-card list for cycle status. Final step shows the computed targets (via `calculateTargets()`) as a preview, then "Lock it in" submits via the same `createProfile` server action. State persists to localStorage (`riven_onboarding_state_v1`) so closing mid-flow picks back up on the same step. See `onboarding-flow.tsx`.
- `/tutorial` — post-profile 4-slide walkthrough, persistence via `Profile.tutorialStep` (0..4 = on slide, 5 = done)

### Client (CLIENT role)
Gated by **paywall middleware** in `(app)/layout.tsx`: redirects to `/pricing` unless `subscriptionStatus` is `trialing | active | comped`. Coaches bypass entirely.

- `/dashboard` — home: today's cal/protein/steps, rotating "Ask RIVEN" prompts, Sunday check-in card (sage when done, pulse when locked), weekly content prompt card (gold when submitted), PWA install banner, notification opt-in card, **time-aware meal-pacing reminder card** (only when she's behind for the hour), **"Message from Sean" liquid-glass chip top-right with gold breath halo when unread** (charcoal-pill monogram "S" — no photo), **sticky "Log a meal" pill floating above the bottom nav** (charcoal when on track, gold + soft pulse when behind on logging).
- `/log` — voice-first meal logging. Mic hero (big charcoal circle with mic icon) at the top; text input demoted into an "Or type it instead" disclosure. Tap mic → record → tap stop → Whisper transcribes → fills textarea → tap Log to submit. Result card includes a **soft-red "Heads up" pill with flagReason** when the meal contains processed/refined food, plus per-item pills showing how Claude split the meal. **Today section** below shows current Central-day meals — each card has a header (combined label + total cals + ⚠ icon if flagged) AND a row of per-item pills underneath; tap the header to re-log the whole combo, tap a pill to re-log just that food. Mic stream is reused across recordings in one session to reduce permission re-prompts. No more Frequent or Earlier-this-week sections — kept the UI focused on the current day (Sean's call).
- `/chat` — RIVEN AI (filtered to `kind: "AI"` — coach messages do NOT appear here)
- `/messages` — coach inbox (kind: "COACH" only, 30-day window, marks seen on visit by writing `Date.now()` to `riven_seen_coach_msg_at` in localStorage)
- `/check-in` — Sunday weekly check-in form (locks except Sunday)
- `/content` — weekly content prompt + video/photo upload to R2 (500 MB)
- `/profile` — wins, weight/waist sparklines, photo timeline, weekly cards mirror dashboard "done" states, push subscribe toggle, **"Manage billing" link → Stripe Customer Portal** (only renders if `stripeCustomerId` is set), sign out, delete account

### Coach (COACH role)
Auto-redirects from any `(app)` route. Bottom nav: Clients / Profile.
- `/coach/clients` — roster: name, week #, phase, today's cal %, last check-in date, status dot (sage=this week, gold=older, dim=never). Search by name/email.
- `/coach/clients/[id]` — full client detail: profile, weight/waist sparklines, latest check-in (photos + form), recent meals, content submissions (with download buttons), chat preview, compose form with **Rewrite** button (Sean-voice R.I.S.E. via Claude) and Send button, **Edit targets** form (updates cutCalories + proteinFloor, posts Sean-voice announcement message + fires push)
- `/coach/profile` — coach identity strip, **Send Monday check-ins now** button (two-step confirm, fires same batch as cron), Sign out, Switch account

### API
- `/api/chat/stream` — Anthropic streaming for `/chat`
- `/api/chat/transcribe` — Whisper voice memos. Strips codec parameters from declared MIME (`audio/mp4;codecs=mp4a.40.2` → `audio/mp4`) before allowlist lookup. Logs upstream Whisper errors to server console as `[transcribe]` lines.
- `/api/r2/sign` — presigned PUT URL
- `/api/coach/download` — coach-only, returns signed R2 URL with `Content-Disposition: attachment`; HEAD-verifies first and falls back to public URL if signing 404s
- `/api/push/subscribe`, `/api/push/unsubscribe`
- `/api/cron/sunday-reminder` — POST, CRON_SECRET-gated. Pushes check-in reminder to clients who haven't submitted yet for current week.
- `/api/cron/monday-checkin` — POST, CRON_SECRET-gated. **Processes 5 clients in parallel** (was sequential, hit the route maxDuration on lists >20). `maxDuration` bumped to 800s as a safety net. Generates personalized Sean-voice check-ins via Claude (uses last 7 days of meal logs + chat history + profile) and posts as COACH messages with push notification. Same batch is also reachable from the coach profile button via a Clerk+role-gated server action.
- `/api/stripe/webhook` — signature-verified by `STRIPE_WEBHOOK_SECRET`. Listens for `customer.subscription.created/updated/deleted` and mirrors state into the User row. Never overwrites `subscriptionStatus="comped"`. Added to middleware's public route allowlist.
- `/api/stripe/portal` — auth-gated. Creates a Stripe Customer Portal session for the signed-in user and 303-redirects there. Called by the "Manage billing" form on /profile.
- `/api/admin/comp-clients` — CRON_SECRET-gated. Accepts `{ emails: string[] }` JSON, marks matching CLIENT users as `subscriptionStatus="comped"`. Idempotent. Used by Sean from terminal to comp new beta clients. Not exposed via UI.

### Server actions
- `src/app/pricing/actions.ts` → `startCheckout()` — lazily creates a Stripe Customer for the user, generates a Subscription Checkout Session with `subscription_data.trial_period_days: 7`, redirects to the Stripe-hosted form. The 7-day trial config lives on the Checkout session (NOT on the Price) so it can be changed without recreating the Price.

## Architecture decisions worth knowing

1. **Coach messages and AI messages are isolated.** `/chat` query filters `kind: "AI"`. Coach messages live in `/messages`. Gold styling, fires push, triggers home-screen "Message from Sean" badge with localStorage-tracked seen state. 30-day visibility window for the badge.

2. **Sean's name is hardcoded.** `senderName` for any COACH-kind message is always `"Sean"`, never `Profile.name`. Prevents stale Profile.name (e.g. "Dean" from when Sean tested a client account) from leaking into client chats.

3. **Coach role detection:** `ensureUserExists` bootstrap in `src/lib/user-bootstrap.ts` runs from `(app)` and `(coach)` layouts. Reads Clerk email, creates User row, auto-promotes to `COACH` if email matches `COACH_EMAIL`. Idempotent. Upgrades existing CLIENT to COACH if email later matches; never downgrades.

4. **Static welcome page + edge caching.** `/` is `○ Static`. Cloudflare cache rule + origin Cache-Control headers serve it globally from edge. TTFB ~50ms after first hit per POP.

5. **Service worker stale-while-revalidate for `/`** only. Repeat visits paint instantly from SW cache; background fetch keeps it fresh. Other navigations stay network-first.

6. **No `<a href="#">` style downloads.** Coach content downloads use signed R2 URLs (`presignDownload` in `src/lib/r2.ts`) with `ResponseContentDisposition: attachment` baked in. Falls back to public URL if signing fails (HEAD-verified before redirect).

7. **Per-client week numbering** for content prompts (not synchronized weekly). `Profile.onboardedAt` is week 1. 52-prompt library interleaves categories so no two same-category prompts back-to-back.

8. **Calorie overestimation rule (20–30%) is in both system prompts** — meal logging (`anthropic.ts`) and chat (`chat-prompt.ts`). Cultural food knowledge (soul food + Caribbean baselines, all pre-overestimated) is also in both. AI never asks "what kind of mac and cheese?" — it knows.

9. **Coach Rewrite button** in compose form rewrites Sean's draft via Claude using the R.I.S.E. framework (Recognize / Interpret / Solve / Expect). System prompt verbatim from spec. Original draft never persisted.

10. **Monday check-in** runs via `runMondayCheckinBatch()` in `src/lib/monday-checkin.ts`. Reads last 7 days of MealLog + DailyTotals + USER-side ChatMessage history per client, sends as context to Claude with Sean-voice system prompt, returns rendered text. Cron route + manual coach-profile button both call this same helper. Processes 5 clients in parallel via `processOneClient` + `Promise.all` batches.

11. **Stripe subscription model:** one tier (`$50/mo, 7-day trial`). The trial is configured in the Checkout session, not on the Price — change `trial_period_days` in `pricing/actions.ts` to adjust. `subscriptionStatus` is the source of truth for paywall access; the webhook keeps it in sync with Stripe. The DB is just a cache so the paywall doesn't call Stripe on every request.

12. **Two-beat meal coaching + processed-food flag.** Every meal-log AI response returns 5 structured fields: macros + `shortName` + `processedFlag` + `flagReason` + `coaching`. `coaching` is exactly 2 sentences, ALWAYS in order: one specific positive, then one specific tighten. When `processedFlag=true`, `flagReason` is one informational sentence (not preachy) on what's in the food and what it does to the body. Renders as a soft-red "Heads up" pill above the coaching prose. System prompt is in `src/lib/anthropic.ts` — strict format rules.

13. **Central-time everywhere.** `src/lib/dates.ts` exports `startOfCentralDay()` — returns the UTC instant of midnight today in Central time, handling CDT vs CST via Intl. Use this for every "today" key/range. NEVER use `new Date().setHours(0, 0, 0, 0)` — that returns midnight in the server's local tz (UTC on Railway), which silently breaks the late-evening Central window. Date displays (`toLocaleString`/`toLocaleDateString`) always pass `{ timeZone: "America/Chicago" }` for the same reason.

14. **Bootstrap re-links by email on clerkId miss.** `ensureUserExists` first looks up by clerkId; if not found, it looks up by email. If a User row with that email exists, it UPDATES the clerkId to the new value (preserves subscription status, profile, history) — instead of failing on the email unique constraint. Lets users keep their data across Clerk instance switches (dev → live), Clerk account re-registrations, and OAuth identity changes.

15. **Welcome page stays out of ClerkProvider.** Edge-cached, statically renderable. For "redirect signed-in users away from /" we use a tiny client-side cookie sniff in `welcome-auth-redirect.tsx` — no Clerk SDK dependency on the public page.

16. **Mic stream reuse across recordings.** `/log` keeps the MediaStream alive across multiple recordings in one page session (`streamRef` in `log-form.tsx`) to avoid an iOS permission re-prompt on every mic tap. Released on component unmount. Within-session improvement only — iOS still re-prompts cross-session for installed PWAs, which is an Apple limitation no JS API can override.

17. **Migration apply on container start.** `npm start` is `prisma migrate deploy && next start`. This means every container boot checks for pending migrations and applies them before serving traffic. Was the root cause of the post-Stripe-deploy crash earlier in the session — without it, the `add_stripe_subscription_fields` migration never ran on production.

18. **Onboarding is a step flow with localStorage resume.** `src/app/(clerk)/onboarding/onboarding-flow.tsx` manages 8 steps + Sean-voice prompts in a single client component. State persists to `riven_onboarding_state_v1` so closing mid-flow picks up. Final step computes target preview client-side via the same `calculateTargets()` the server uses, then submits via the existing `createProfile` server action. Same DB contract as the old form.

19. **Coach message chip is liquid glass + gold breath halo when unread.** `coach-message-badge.tsx`. Unread state: translucent `bg-white/55` + `backdrop-blur-xl` + `border-white/40` with `border-t-white/70` for the light-highlight detail. Animated via `riven-coach-breath` keyframe — soft gold halo that breathes outward every 2.8s. Red unread-count dot in the corner. Read state: solid charcoal pill, no glow. Avatar is a charcoal-gold serif "S" monogram, NOT a photo (we tried photos; they don't crop well at 28 px). Server passes the full last-30-days list of coach messages; client counts unreads by comparing each `createdAt` to a `riven_seen_coach_msg_at` localStorage timestamp.

20. **DailyTotals are recomputed, not incremented.** `logMeal` and `undoLastMeal` both wrap their work in an interactive Prisma transaction that: (1) creates/deletes the MealLog, (2) re-sums ALL of today's MealLog rows for that user via `where: { createdAt: { gte: today, lt: tomorrow } }`, (3) UPSERTs DailyTotals with that authoritative sum. This is more robust than `{ increment: X }` math — past bugs (mis-bucketed rows from the TZ-fix migration window) self-heal on the next log/undo because writes are always re-derived from source-of-truth MealLog rows. The macro upsert preserves `totalSteps` since steps are managed by a separate action.

21. **Per-item meal breakdown.** Claude's structured output for meal logs returns an `items` array (1-12 items, each `{ name, calories, protein, fat, carbs }`). Stored as JSON on `MealLog.items`. UI renders each item as a tappable pill inside the meal card on /log — tap a pill to pre-fill the textarea with just that food's name. Lets a client who logged "Big Mac, large fries, quest chips" re-log just the Big Mac without committing to the whole combo. System prompt in `src/lib/anthropic.ts` enforces: brand names when applicable ("Big Mac" not "burger"), sides/drinks split out as separate items, components of a single named dish (mac and cheese, oxtails with rice and peas) stay merged.

22. **Daily reset is automatic at midnight Central.** `/dashboard` and `/log` both have `export const dynamic = "force-dynamic"` (no static caching) AND mount `<RefreshOnDayChange />` (`src/components/refresh-on-day-change.tsx`). That component does two things: (a) on `visibilitychange` (tab becomes visible after being backgrounded), it calls `router.refresh()` so a PWA opened in the morning picks up fresh server data; (b) every 60s it polls the Central date and calls `router.refresh()` when the date rolls over so a tab sitting open at midnight transitions cleanly from yesterday's totals to today's 0. Pure SSR-revalidation — preserves client state, just re-fetches data.

23. **Proactive Sean messaging engine.** `src/lib/sean-messages.ts` runs as an hourly cron via `/api/cron/sean-messages` (new Railway service: `sean-messages`, hits the endpoint on `0 * * * *`). Per-client decision tree fires categories based on Central-time hour + activity history. Guardrails: 48h cooldown per category, max 3 proactive sends per client per Central day, only fires for `trialing | active | comped` clients. Categories live as exported arrays of variants in `src/lib/sean-message-variants.ts` (plain TypeScript strings — edit any line directly).

    **Categories currently live:**
    - `rhythm_wed_pm` (Wed 7 PM) — 100 variants
    - `rhythm_fri_pm` (Fri 7 PM) — 100 variants
    - `behavioral_24h` (6 PM if no log in 24h) — 100 variants
    - `behavioral_72h` (7 AM if no log in 72h) — 100 variants
    - `progress_streak_3` (7 AM after 3-day log streak) — 30 variants
    - `progress_streak_5` (7 AM after 5-day log streak) — 30 variants
    - `progress_streak_7` (7 AM after 7-day log streak) — 30 variants

    **Streak logic:** `computeStreakEndingYesterday` counts consecutive Central-time calendar days, ENDING YESTERDAY, that have at least one MealLog. Picks the HIGHEST applicable threshold so a 7-day streak fires the 7-day celebration only (not all three stacked). When she breaks and rebuilds a streak, the lower-threshold messages re-fire — cooldown's expired, year-long dedup picks a fresh variant.

    **Year-long dedup:** `pickFreshVariant` queries the client's last 365 days of received messages in that category, builds a Set of seen content, picks random from the unseen bank. Fallback to full bank only if she's burned through all 100 in a year (basically impossible for rhythms, possible for behavioral_24h on max-frequency).

    All streak variants explicitly reference LOGGING ("you logged 3 days," "5-day log streak," "every meal tracked"). No vague "rhythm" / "body chemistry" language — the celebration matches what the client actually controlled.

## What's deliberately not built (v2/v3)

- Coach inbox/triage view ("/coach" landing, currently redirects to /coach/clients)
- Coach assigns Phase progression (Phase 1 → 2)
- Macro override on meal logs from coach side
- Video gallery across all clients
- Per-client timezone (everything uses America/Chicago)
- Annual subscription plan (currently only monthly at $50)
- Founding-member / referral pricing tier
- Stripe Tax (we don't collect sales tax — Stripe handles US payments; add Stripe Tax when crossing state nexus)
- Rate limiting on `/api/chat/stream`, `/api/chat/transcribe`, `/api/r2/sign`
- Marketing/landing pages beyond `/` and `/pricing`
- Sentry / error tracking
- Email customization (Clerk defaults)
- Native iOS/Android app (the PWA is fine; iOS mic permission persistence is an Apple platform limitation, not worth a native rebuild pre-revenue)

## Known issues / things that bit us

1. **`redirect()` inside `try/catch` swallows the NEXT_REDIRECT signal.** Layout role gates must put redirects OUTSIDE try/catch. Bit us hard in coach role gating. Fixed.

2. **`"use server"` files can only export async functions.** Exporting constants like `TUTORIAL_TOTAL_SLIDES` from `tutorial-actions.ts` failed the production build. Moved to plain `tutorial.ts` module.

3. **Tailwind class `px-container-mobile` was a silent no-op** for weeks — the spacing token was `container-padding-mobile`, not `container-mobile`. Every page had zero horizontal padding on mobile and nobody noticed. Aliased both. Don't remove the aliases.

4. **CSS `calc()` requires spaces around `+`/`-`.** Tailwind arbitrary values strip spaces. Use underscores in JIT syntax: `top-[calc(env(safe-area-inset-top)_+_12px)]`. Without the underscores, Safari drops the property entirely and the element falls back to `top: auto`.

5. **R2 forcePathStyle: true is required.** Virtual-host-style signed PUT URLs don't work reliably on R2. Set in `src/lib/r2.ts`. Don't remove.

6. **Clerk dev-keys-only workarounds (removed during go-live).** Dev keys required `NODE_OPTIONS=--max-http-header-size=32768` and `/clerk_(.*)` in the public route matcher because Clerk dev-mode emits oversized handshake headers and redirects to `/clerk_<timestamp>` URLs. Both are GONE — live keys don't need either. If we ever revert to dev keys (don't), put them back; otherwise they're dead.

7. **R2 NoSuchKey on signed downloads** — production hit this. Likely env mismatch (`R2_PUBLIC_URL` vs `R2_BUCKET_NAME` pointing at different buckets), OR a public-access hash rotation, OR upload-never-completed records. Current handling: HEAD-verify signed URL first, fall back to direct public URL redirect, then to a branded "file not available" HTML page. Investigate the env if it persists on new uploads.

8. **iOS Safari black-flash on cold load** had multiple stacked causes resolved over the session:
   - Material Symbols stylesheet was render-blocking (3.7s on slow networks) → async-loaded with media=print swap
   - PWA splash was missing icon files → generated cream+R PNGs in `/public/icons/`
   - Dark-mode users saw the navigation-transition black before our CSS applied → `color-scheme: light` + `html{background: #FAF7F2}` in inline critical CSS
   - SW was network-first for navigations → switched `/` to SWR

9. **PageSpeed Mobile plateaus around 70.** Lighthouse's Slow 4G + Moto G Power emulation is brutal for a marketing page with a hero image. Real users on real networks see 85-95. The remaining ceiling on the lab test is the hero image bytes + Tailwind CSS bundle parse cost.

10. **Local curl is filtered by Cisco Umbrella on school wifi.** Resolves rivenmethod.com to 146.112.61.110 (CF block IP) and SSL cert validation fails. Use cellular hotspot or browser DevTools when verifying locally. PageSpeed Insights runs from Google's servers, not your machine, so its measurements are valid.

11. **The friendly 404 HTML page for failed R2 downloads** is uncommitted on disk only (`src/app/api/coach/download/route.ts`). Working tree change. User asked not to push it. Safe to ship later if desired — it only fires when both signed and public R2 URLs return non-200.

12. **DailyTotals timezone bug (fixed).** Originally every "today" calc used `new Date().setHours(0,0,0,0)` which on Railway (UTC server) returns midnight UTC, not midnight Central. Meals logged 7 PM–midnight CDT got filed under tomorrow's UTC date, and the coach roster showed 0s for late-evening views. Fixed in commit `3efd4e2` via `startOfCentralDay()` in `src/lib/dates.ts`. Existing pre-fix DailyTotals rows are still keyed at UTC midnight — they become mis-bucketed against new reads but aren't deleted. Net: ~1 day of slightly-off display numbers, then clean.

13. **Stripe API version pinning.** SDK is pinned to `2026-04-22.dahlia`. In this version `current_period_end` moved off `Subscription` onto `subscription.items.data[0].current_period_end`. The webhook handler reads from the new location. If you bump SDK or API version, double-check this field — Stripe has been moving it.

14. **Two Stripe modes have separate everything.** Live and test mode have separate Products, Prices, Customers, Webhooks. Don't expect anything to carry over when you flip the test/live toggle. Sean's `sean@highprofileconsultancy.com` test-trial account in live mode points at a test-mode `stripeCustomerId` that doesn't exist in live mode — the "Manage billing" button would 400 if clicked. Not a real-customer issue.

15. **iOS PWA microphone permission.** Apple sandboxes mic per session for installed PWAs. Re-prompts cross-session even after a previous grant. NO JavaScript API can override this — it's a platform limitation. Within a single page session we now reuse the MediaStream (commit `d673291`) so subsequent recording taps don't re-prompt. Cross-session is just iOS being iOS. Workarounds for users: tap "Allow" instead of "Allow once" if iOS offers both; install as PWA via Add to Home Screen (slight improvement); or build native iOS app (months of work, not worth it pre-revenue).

16. **Local curl filtering on owner's network.** Sean's home WiFi routes through Cisco Umbrella DNS, which resolves rivenmethod.com to a CF block IP (146.112.61.110). Result: `curl https://rivenmethod.com/...` fails with SSL cert errors locally. Workarounds: cellular hotspot, change Mac DNS to 1.1.1.1/8.8.8.8 in System Settings, or hit the Railway-direct domain `https://rivenaiapp-production.up.railway.app/...` (though that bypasses Cloudflare's cache and Clerk handshake may misbehave on non-canonical hosts).

## Recent commits (chronological — newest first, this session top, prior sessions below)

Post-launch polish (2026-05-14 to 2026-05-17):

```
8c93e55 Streak variants: anchor every line to LOGGING, not vague consistency
7122cf5 Sean messages: progress streak celebrations at 3, 5, and 7 days
491c510 Sean messages: 400 variants in Sean's voice + 365-day dedup per client
ad4ed6e Force fresh render + auto-refresh on day change so totals reset at midnight
b1af3fd Log page: keep only Today, drop Frequent and Earlier this week
f4272f1 Proactive Sean-voice messaging — Phase 1 (rhythm + 24/72h behavioral)
01ef4a9 Meal log: per-item breakdown + per-item Frequent + item pills in cards
e94325f Fix negative DailyTotals — recompute from MealLog sum instead of incrementing
```

Launch sprint commits (2026-05-13 to 2026-05-14):

```
d673291 Voice log: reuse mic stream across recordings in one session
32fa191 Meal log: two-beat coaching, processed-food flag, shortName, Frequent
3efd4e2 Fix DailyTotals timezone bug — use Central time everywhere
160e8f4 Bootstrap: re-link User row by email when clerkId changes
4ccf1fc Drop Clerk dev-key handshake workaround from middleware
4319c36 Comp the initial 8 beta clients via one-time data migration
12bda21 Apply Prisma migrations on container start
24bf791 Stripe portal + Manage billing UI + comp-clients admin route
eac276d Stripe paywall — gate (app) routes on active subscription
59efb31 Stripe payment ingest: /pricing + checkout action + webhook
30b8057 Stripe foundation: SDK + lib helpers + schema migration
7671456 Force America/Chicago on every date display + greeting
91c54f4 Swap Sean photo avatar for a charcoal-gold S monogram
d88a6bc Re-crop Sean avatar to head-and-shoulders
05ea845 Add CLAUDE.md — design system + voice rules auto-loaded each session
47450c1 Meal-log: slip in concrete suggestions when warranted + transcribe MIME fix
bea11f3 Monday check-in batch: run 5 clients in parallel, bump route timeout
0a89a5d Welcome page auto-redirect + step-flow onboarding in Sean's voice
2d19e43 Meal-log nudges: sticky pill, time-aware reminder card, nav dot
2ff24b3 Voice-first meal logger + 45-word cap on AI review
a4abdb2 PWA: detect in-app browsers and inflate the install CTA
d3a5818 Coach badge: liquid-glass bubble + soft gold breath halo
7d5054e Add Sean photo for coach message chip          (later replaced w/ monogram)
fc54737 Coach badge: heartbeat glow on unread state    (later replaced w/ breath)
914e2b6 Coach badge: Sean avatar + gold-unread / charcoal-read + red unread count
ff50755 Switch cut target to 23% off maintenance with 1400 cal floor
```

Prior sessions:

```
dddc13d Coach trigger button for the Monday check-in batch
3cefff2 RIVEN AI voice + cultural food knowledge + Monday Sean check-in cron
24dae6e Coach rewrite button (R.I.S.E. voice) + download fallback for NoSuchKey
3bba850 Enable Next.js optimizeCss — extracts critical CSS, makes Tailwind bundle non-blocking
bd5cee6 Service worker: stale-while-revalidate for the welcome page
36ab125 Kill the black flash for iOS dark-mode visitors on rivenmethod.com
334fcd9 Generate PWA icons + wire into metadata
6b9cba4 Welcome page critical path: inline CSS, drop blurs, defer SW
1bbda24 Add sharp for native image optimization
a3a244a Cache welcome page at Cloudflare edge — Cache-Control on /
3ec71a6 Mobile perf pass: async Material Symbols + self-host hero + cache headers
7d2e787 Tighten weekly prompts to single sentences + static-analysis perf pass
4434dd1 Isolate RIVEN Ai from coach messages, persistent glow chip, shorter weekly prompt
db50fd2 Coach profile page + always render coach messages as "Sean"
059c2f5 Post-profile tutorial walkthrough + two bug fixes
f8582ee Smoother prompt transitions on dashboard and chat empty state
6b55a88 Ask RIVEN rotator: 2-line wrap so long prompts aren't truncated
c495175 Coach dashboard + push notifications + mobile padding fix
```

## How to test the new stuff

### Stripe end-to-end (live mode — real cards charge real money)
1. Open `rivenmethod.com` in an incognito window
2. Tap "I'm new — start here" → sign up with a fresh email (e.g. `lamper.2019+livetest@gmail.com`)
3. Complete onboarding + tutorial → you should hit `/pricing` (paywall fires)
4. Tap "Start your 7-day trial" → Stripe Checkout opens
5. Real card. Card is HELD; no charge for 7 days
6. After submit, you should land on `/dashboard?subscribed=1` with full access
7. Verify in Stripe dashboard → Customers — new customer with `trialing` subscription
8. Profile → "Manage billing" → Stripe Customer Portal opens (cancel, change card, etc.)

### Voice + cultural food + two-beat coaching + flag (meal logging)
1. Sign in as a test client (`lamper.2019+test1@gmail.com` etc.)
2. `/log` → tap the mic → say "fried chicken and mac and cheese with sweet tea"
3. Tap stop → wait for transcription → tap "Log it"
4. Expect:
   - Soft-red "Heads up" pill above the coaching (sweet tea + fried chicken trigger processedFlag)
   - One sentence on what those do to the body — informational, not preachy
   - Coaching: one positive ("real chicken, decent protein") then one tighten ("swap sweet tea for unsweet next time")
   - Macros estimated 20-30% above neutral baseline (~1000 cal range)
5. "Today" section appears with the shortName as the label, ⚠ icon on the row
6. Log it again the same way 2-3 more times — "Frequent" section will surface that shortName after the 3rd log

### Monday check-in
1. Sign in as coach
2. `/coach/profile` → Coaching tools → **Send Monday check-ins now**
3. Confirm second tap
4. Wait ~30-60s for batch (parallel processing 5 at a time)
5. Result: "Done. Sent to N of M clients."
6. Sign in as a test client → `/messages` → read the actual check-in
7. Verify: signed "Lock it in. — Sean", references specific things from her actual data

### Coach rewrite
1. As coach, open any client's detail page
2. Compose form → type a rough draft
3. Tap **Rewrite** → ~1–3s → text swaps to Sean voice with gold flash
4. Edit if needed, hit Send

### Onboarding flow
1. Sign up with a fresh email
2. Walk through the 8 steps. State persists to localStorage — close tab mid-flow, reopen, you should land back on the step you left
3. Final step shows your computed cut/maintenance/protein floor numbers BEFORE submitting
4. Tap "Lock it in" → land on /tutorial → /dashboard

## File map (the important ones)

```
CLAUDE.md                                   # design system + voice rules, auto-loaded each session
src/
  app/
    page.tsx                                # welcome (public, static, edge-cached)
    welcome-auth-redirect.tsx               # cookie-sniff redirect to /dashboard for signed-in users
    layout.tsx                              # root, inline critical CSS, color-scheme, icons metadata
    pricing/
      page.tsx                              # public pricing page (3-state CTA)
      actions.ts                            # startCheckout server action → Stripe Checkout
    (clerk)/
      layout.tsx                            # ClerkProvider
      sign-in/, sign-up/                    # Clerk components
      onboarding/
        page.tsx                            # mounts <OnboardingFlow />
        onboarding-flow.tsx                 # 8-step Sean-voice flow, localStorage resume
        actions.ts                          # createProfile (Mifflin-St Jeor + targets)
      tutorial/                             # 4-slide walkthrough
      (app)/                                # CLIENT routes
        layout.tsx                          # ensureUserExists + COACH redirect + PAYWALL gate
        dashboard/
          page.tsx                          # home; mounts CoachMessageBadge, sticky log pill,
                                            # reminder card, NotificationOptIn
          actions.ts                        # logSteps server action
        log/
          page.tsx                          # fetches frequent + today + earlier meals
          log-form.tsx                      # voice-first mic + three meal sections + ResultCard
          actions.ts                        # logMeal, undoLastMeal, getFrequentMeals, etc.
        chat/                               # RIVEN AI (filtered to kind: AI)
        messages/                           # coach message inbox
        check-in/                           # Sunday form
        content/                            # weekly content prompt
        profile/                            # client profile + Manage billing
      (coach)/                              # COACH routes
        layout.tsx                          # role gate + CoachBottomNav
        coach/
          page.tsx                          # redirects to /coach/clients
          clients/page.tsx                  # roster
          clients/[id]/
            page.tsx                        # client detail (long scroll)
            send-message-form.tsx           # compose + Rewrite button
            edit-targets-form.tsx           # calorie/protein editor
          profile/
            page.tsx                        # coach profile
            trigger-monday-checkins-button.tsx
    api/
      chat/stream/                          # streaming Claude
      chat/transcribe/                      # Whisper (codec-param-stripping MIME parser)
      r2/sign/                              # presigned PUT
      coach/download/                       # signed GET + HEAD verify + fallback
      cron/sunday-reminder/                 # Sunday push reminder
      cron/monday-checkin/                  # Monday Sean check-in batch (5-parallel)
      cron/sean-messages/                   # hourly proactive-messaging tick
      stripe/
        webhook/                            # signature-verified Stripe event listener
        portal/                             # Customer Portal redirect
      admin/
        comp-clients/                       # CRON_SECRET-gated comp helper
      push/subscribe, /unsubscribe
  components/
    bottom-nav.tsx                          # gold dot on Log icon when behind
    coach-bottom-nav.tsx
    coach-message-badge.tsx                 # liquid-glass chip, gold breath halo when unread,
                                            # charcoal-gold serif S monogram (not photo)
    notification-opt-in.tsx
    pwa-install-banner.tsx                  # platform-aware + in-app-browser detection + inflated CTA
    push-subscribe-button.tsx
    rotating-text.tsx
    sparkline.tsx
    sw-register.tsx
  lib/
    auth.ts                                 # Clerk shim
    user-bootstrap.ts                       # ensureUserExists (clerkId-then-email re-link, COACH auto-promote)
    coach.ts, coach-actions.ts              # send/edit/rewrite/trigger server actions
    anthropic.ts                            # meal logging system prompt + client (two-beat + flag)
    chat-prompt.ts                          # chat persona system prompt + client context builder
    monday-checkin.ts                       # runMondayCheckinBatch + processOneClient (parallel)
    tutorial.ts, tutorial-actions.ts        # tutorialStep progression
    push.ts                                 # web-push wrapper + sendPushToUser
    r2.ts                                   # S3 client + presignUpload + presignDownload
    stripe.ts                               # Stripe SDK + hasActiveSubscription + getAppUrl
    dates.ts                                # startOfCentralDay — used everywhere for "today"
    dashboard.ts, progress.ts, calculations.ts
    meal-pacing.ts                          # getMealPacing (cached, drives reminder card + nav dot)
    daily-quotes.ts, ask-riven-prompts.ts
    content-prompts.ts                      # 52 single-sentence prompts + rotation
    week.ts                                 # Central-time week boundaries
  middleware.ts                             # Clerk + public route allowlist (includes /pricing,
                                            # /api/stripe/webhook)
public/
  icons/icon-192.png, icon-512.png          # cream + R, generated via sharp
  apple-touch-icon.png
  welcome-hero.png                          # self-hosted
  manifest.json
  sw.js                                     # SW with SWR for /
prisma/
  schema.prisma                             # User + Profile + MealLog (with shortName/flag) + ...
  migrations/                               # see Schema section above for the migration list
next.config.mjs                             # headers() + optimizeCss + sharp config
package.json                                # "start": "prisma migrate deploy && next start"
```

## Credentials hygiene reminder

The following keys have appeared in chat history at various points during build sessions. **Rotate them when you have a free moment** (Stripe live secret has already been rotated once mid-session after being pasted — the current value is fresh):

- `CRON_SECRET` (`ce3fb...`) — still original. Crons reference via `${{rivenaiapp.CRON_SECRET}}` so rotating in Railway propagates automatically.
- `STRIPE_SECRET_KEY` (sk_live_*) — current value was generated AFTER the original was exposed. Safe but rotate again if paranoid.
- `STRIPE_WEBHOOK_SECRET` (whsec_*) — live mode value is in Railway only; test-mode value was visible in a screenshot once.
- Stripe test mode keys — low risk (can't move real money) but were visible in screenshots.
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, Clerk `pk_test_*`/`sk_test_*` (legacy, no longer used), R2 keys, GitHub PAT, Railway DB password, VAPID private key — exposed in prior sessions.

**Live keys never to expose in chat:** `sk_live_*`, `whsec_*` (live mode), Stripe restricted keys, `CLERK_SECRET_KEY` (live), Anthropic prod key, OpenAI prod key. Paste them directly into Railway's Variables tab.

## Known launch state (as of 2026-05-14)

- 8 beta clients comped (subscriptionStatus="comped") — see migration `20260514010000`
- Sean's test live-mode trial subscription is active for `sean@highprofileconsultancy.com` (use it to keep testing cancel/renew flows; delete via /profile when you're done with it)
- No real paying customers yet — Sean has not announced publicly. Plan: message the 8 beta clients first about the live-mode swap, then announce.
- Stripe Tax: NOT enabled. US payments only. Add Stripe Tax when revenue triggers state nexus thresholds.
- Annual plan: NOT created. Only monthly $50.
- Founding member offer (first 50 at $40/mo locked-in): NOT created. Plan to add as a separate Stripe Price + a /pricing variant when ready for public push.

## Things to do soon (not blocking)

1. **Roll exposed secrets** when there's a slow moment — see hygiene section above.
2. **Message the 8 beta clients** about the Clerk live swap: they need to sign in again (same email; the bootstrap will re-link their User row). Suggested copy is in the chat transcript.
3. **Clean up `sean@highprofileconsultancy.com`** test account on /profile → Delete Account. It has stale test-mode `stripeCustomerId` that would 400 if Manage billing is clicked.
4. **Set Mac DNS to 1.1.1.1 / 8.8.8.8** in System Settings → Network → WiFi → Details → DNS so Sean can curl rivenmethod.com from his terminal without hitting Cisco Umbrella block IP.
5. **Annual plan + founding member offer** when ready for public marketing push.

---

End of handoff. Coding agent: read this top to bottom before suggesting changes. Ask if anything is ambiguous before editing. **Read `CLAUDE.md` too** — it has the design + voice rules that aren't repeated here.
