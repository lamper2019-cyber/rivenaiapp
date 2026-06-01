# RIVEN — Session Handoff Context

Paste this whole document into a new chat with a coding agent (Claude Code, etc.) to give them complete context. Last updated 2026-05-27, end of the "unified Sean thread + village feel" sprint (delayed AI auto-replies on a single coach thread, 60s voice moments on monthly check-in, 3x/day proactive prompts with tap chips, time-aware dashboard ritual, presence indicator, peer wins broadcast, first names in the collective counter, coach messaging dashboard, dashboard / profile chill-pass).

Also read `CLAUDE.md` at the repo root — it captures the design system and Sean-voice rules in a form that auto-loads into every Claude Code session.

---

## Working style with the coding agent

**When Sean asks for UI/UX ideas, illustrate with ASCII wireframes — NOT JSX, NOT prose.** Any time he asks "what are some ideas for...", "how should X look?", "what are my options for the dashboard...", each option in your response should be a plain-text ASCII wireframe in a fenced code block. Use boxes (`┌─┐ │ └─┘`), pipes for columns, dashes for dividers, `[ Button ]` for buttons, `( ) (•)` for radios, `[✓]` for checkboxes, `▼` for dropdowns. Use real labels, real button text, real-ish data — never `<Component>` tags. He thinks visually; ASCII shows the actual shape on the page, JSX forces him to mentally parse markup, prose forces him to imagine the layout.

**Label options A / B / C / D.** Sean prefers comparing options by letter. Use `**Option A — short name**` then the wireframe, repeat for B/C/D. Keep one tradeoff line per option (Pro / Con) and a final recommendation in prose. Width: ~65–75 chars so wireframes render cleanly.

This rule does NOT apply when he asks for a build directly (the visual is implied in the code being written) or for backend/architecture questions.

---

## Session updates (since 2026-05-23 — through 2026-05-27) — current

Read this BEFORE the older sections below. A lot has shifted in the
last week and the older sections reflect earlier behavior in places
that contradict what's now live.

### 2026-05-27 simplification pass — Sean's "keep it simple" reset

End-of-day pivot. Sean said: *"I want to keep it simple, I don't have
users to test complex flows yet."* Stripped the app to its bones.

**Three tabs only: Home / Log / Profile.** The "Sean" tab is gone. Sean's
coaching is now a single surface — the `SeanPromptHeadline` at the top
of `/dashboard`. No bottom-input chat, no thread history UI, no
back-and-forth.

What that means concretely:

- **`/chat` is now a redirect to `/dashboard`.** The route is preserved
  so old push-notification deep-links bounce home rather than 404.
  The `ChatUI` component file still exists (dead code, will be cleaned
  up later if Sean stays committed to this path).
- **AI auto-reply pipeline shut off.** `sendToSean` no longer schedules
  a `PendingAiReply`. The `process-ai-replies` cron route is gated
  behind `ENABLE_PROCESS_AI_REPLIES=1` (defense-in-depth so any stale
  queued rows don't drain into surprise pings). The `scheduleAiReply`
  helper and `PendingAiReply` table are still in the codebase but no
  longer called from any production path.
- **All push notification deep-links → `/dashboard`.** Updated in
  `coach/messages/actions.ts` (text replies), `coach/messages/voice-actions.ts`
  (voice memos), `lib/coach-actions.ts` (manual coach messages + target
  updates), `lib/sean-daily-checkins.ts` (cron pings — already there).
  No surface should ever deep-link to `/chat` again.
- **`SeanPromptHeadline` plays audio inline.** Voice memos from Sean
  now render an HTML5 `<audio controls>` element directly in the
  headline card — no "Listen" CTA, no second tap, no /chat redirect.
- **Chip-tap replies still work.** She taps, the message persists
  (so Sean sees her response in `/coach/messages`), `chipsRepliedAt`
  is stamped, the headline collapses to a "Sent. Sean'll see this."
  confirmation. No AI follow-up.

**30-day weight check-in card on `/dashboard`.** New surface at the
top of /dashboard (above PWA banner). Sliders for weight + waist,
nothing else. Auto-appears when 30+ days have passed since her last
WeeklyCheckIn row (or 30+ days after `Profile.onboardedAt` for clients
who've never checked in). Submitting writes a `WeeklyCheckIn` row with
sensible defaults for the heavy fields (menuAdherence=MOSTLY, sleepAvg=7,
cycleStatus=NA, stress=5, winsAndStruggles="") and updates
`Profile.currentWeight`. Files: `src/lib/monthly-weight-checkin.ts`,
`src/app/(clerk)/(app)/dashboard/monthly-weight-actions.ts`,
`src/components/monthly-weight-checkin-card.tsx`.

**Full `/check-in` form still exists**, repositioned on `/profile` as
"Full check-in" — optional path for clients who want to log photos,
sleep, stress, and wins-and-struggles. The slider on /dashboard is the
default monthly cadence.

**Weight graph restored on `/profile`.** Sparkline over all
`WeeklyCheckIn.weight` rows with goal-weight target line. Was removed
during the chill-pass earlier this session; now justified because the
slider check-in actually writes data on a predictable cadence. Waist
graph stays hidden — Sean wants weight as the single tracked number
on /profile.

**Retired crons** (kill-switched, not deleted from code):

- `sean-messages` — RETIRED 2026-05-26, gate `ENABLE_SEAN_MESSAGES_CRON=1`.
  Coverage moved to morning/midday/evening check-in crons.
- `process-ai-replies` — RETIRED 2026-05-27, gate
  `ENABLE_PROCESS_AI_REPLIES=1`. No /chat input means no client
  messages to reply to.

**Active crons:**

- `morning-checkin` ~8 AM CT — Sean prompt to every active client.
- `midday-checkin` ~1 PM CT — Sean prompt only to clients who haven't
  logged a meal today.
- `evening-checkin` ~8 PM CT — Sean prompt to every active client.
- All three drop a COACH ChatMessage with chipOptions, fire a push to
  `/dashboard`, and respect a 4-hour cooldown vs any other COACH
  message to avoid pile-on.
- `monday-checkin` (Sunday ritual prompt rotation) — still alive.

The cumulative effect: she gets ~2 Sean pings/day max, all delivered
via the same `SeanPromptHeadline` surface, all answerable in one tap.

### The headline shift: RIVEN AI retired as a destination → unified "Sean" thread [SUPERSEDED 2026-05-27]

**[Note: this section describes the mid-week state. The /chat thread
and AI auto-reply pipeline have since been retired — see the
"2026-05-27 simplification pass" above. Kept for historical context
on how the chip-prompt + voice-memo surfaces came to exist; those
mechanics still apply, they just render through `SeanPromptHeadline`
on /dashboard now instead of a separate /chat tab.]**

The biggest mental-model change. Before this sprint: `/chat` was a streaming AI assistant, separate from `/messages` (Sean's proactive coach notes). Two surfaces, two voices.

Now: `/chat` is **the Sean tab** — one unified thread. Bottom nav swapped "RIVEN AI" → "Sean" (icon `forum`). She sends, AI auto-replies in Sean's voice within ~2 minutes, and the bubbles read as "from Sean" with no AI label. Real Sean can drop in at any point via the new coach messaging dashboard, and his manual replies cancel the queued AI auto-reply so clients never get duplicates.

The streaming route `/api/chat/stream` still exists in the codebase (log_meal tool is still wired) but is no longer called from the client. Can be retired in a future pass.

### Schema additions (newest at top)

```
20260527160000_presence              -- User.lastDashboardSeenAt
20260527150000_chat_chips            -- ChatMessage.chipOptions Json? + chipsRepliedAt
20260527140000_voice_moments         -- VoiceMoment table + ChatMessage.audioUrl/audioDurationSec
20260527120000_unified_sean_thread   -- PendingAiReply table + ChatMessage.aiGenerated
20260526120000_add_daily_mood_cause  -- DailyMood.cause String?
20260525140000_cheer_ceremony_seen   -- User.cheersLastSeenAt + firstCheerCeremonySeenAt
20260525130000_sunday_prompt_formats -- SundayPrompt.kind + options; SundayPromptAnswer.choice + body nullable
20260525120000_add_daily_mood        -- DailyMood table
```

New / extended models:

- **`PendingAiReply`** — queue for delayed AI auto-replies on the Sean thread. Columns: id, userId, triggerMessageId, scheduledFor, status, sentAt, errorMessage, createdAt. Status values: `pending | sent | failed | cancelled`. Cancelled = Sean wrote back himself, so the AI reply was preempted from the coach dashboard.
- **`VoiceMoment`** — queue for milestone voice-memo prompts. Currently only fires on monthly check-in submission. Columns: id, recipientUserId, triggerKind, triggerSourceId (unique with recipient + kind), status, audioUrl, durationSec, deliveredMessageId, createdAt, recordedAt. Status values: `queued | recorded | skipped`.
- **`DailyMood`** — one-tap-a-day community pulse. Columns: id, userId, mood (tired|blah|good|fire), cause (sleep|food|stress|… per-mood vocab), centralDate, createdAt, updatedAt. Unique on (userId, centralDate).
- **`ChatMessage` extensions**: `aiGenerated Boolean @default(false)` (marks AI-on-Sean's-behalf vs real-Sean), `audioUrl String?` + `audioDurationSec Int?` (voice memos), `chipOptions Json?` + `chipsRepliedAt DateTime?` (tap-reply chips on proactive prompts).
- **`SundayPrompt` extensions**: `kind String @default("pulse")` + `options Json?`. Four format kinds: `pulse | this_or_that | is_this_you | open` (open = legacy written-answer; auto-rotation cycles the first three). **`SundayPromptAnswer` extensions**: `choice String?` (the option key tapped) + `body` made nullable. Reactions enum tightened from rose/strong/leaf → `heart | fire`.
- **`User` extensions**: `cheersLastSeenAt DateTime?` (falling-roses ceremony state), `firstCheerCeremonySeenAt DateTime?` (welcome-banner-once flag), `lastDashboardSeenAt DateTime?` (presence indicator), `cheerLastPushAt DateTime?` (10-min push throttle for cheers, from earlier sprint).

### Sean thread mechanics — delayed AI auto-reply

When she sends Sean a message on `/chat`:

1. Her message persists as a `ChatMessage` (kind=COACH role=USER) — kind=COACH because she's now writing into the coach thread, not the AI chat. Old `kind=AI` thread messages stay in the DB but don't render on the new tab.
2. A `PendingAiReply` row is queued with `scheduledFor` randomized 90–130s in the future (skewed slightly toward the back of the window).
3. The new cron at `/api/cron/process-ai-replies` polls every minute, picks up due rows, calls Claude with the same persona prompt + live context as the old `/chat/stream`, inserts the response as kind=COACH with `aiGenerated=true`, marks the row sent.
4. Clients see "from Sean." No AI label. The `aiGenerated` flag is only surfaced on the coach side.

The **"Sean's reading…" indicator** in the client UI does NOT appear immediately when she sends — it delays ~60 seconds, then shows for the rest of the wait. Her message sits alone for ~60s → indicator appears → reply lands ~60s later. Feels human; no bot tells.

If real Sean writes back from `/coach/messages`, `sendCoachReply` flips any pending `PendingAiReply` to `status=cancelled` so clients never get the AI follow-up on top of his note.

### Coach messaging dashboard at `/coach/messages`

Three-column board, RIVEN brand tokens:

- **Left**: client list (search + filter chips: All / Needs you / Last 24h). Rows show avatar initial, first name, last message preview, relative time. Gold dot when she's waiting on Sean. "N need you" pill in header. "Voice moments · N queued" gold pill below header when there are queued voice-memo triggers.
- **Center**: active thread. Header with client name + email + "Auto-reply queued" chip when a PendingAiReply is in the queue. Bubbles: her side (cream surface, left), Sean side (charcoal, right). Sean bubbles show "you" or "◆ auto-reply" tag so he can spot which messages he authored. Reply input at bottom. Enter to send, shift+enter newline. Sending cancels the pending AI auto-reply.
- **Right (desktop only)**: client context — current weight + start + goal + lbs lost / lbs to go, calorie target, protein floor, "Open full profile" CTA → `/coach/clients/[id]`.

Auto-refreshes every 30s so new client messages land without manual reload. New top-level coach nav item between Clients and Leads.

### Voice moments — 60-second voice memos on monthly check-in

`/check-in/actions.ts` queues a `VoiceMoment` row after every successful monthly check-in submission (one per check-in, unique constraint prevents double-queue on re-submit). The "Voice moments · N queued" pill on `/coach/messages` opens a modal listing every queued trigger. Sean taps "Record" on a row → inline 60-second recorder using MediaRecorder API. Live countdown, auto-stops at 60s. Preview pane with native `<audio>` controls. "Re-record" or "Send to Maya" → upload to R2 (new `voice` scope, audio MIME types allowed, 10 MB cap) → `sendVoiceMoment` action persists a COACH ChatMessage with audioUrl + audioDurationSec → push fires "Sean recorded you a voice memo. Tap to listen." → any pending AI auto-reply is cancelled (voice memo is a stronger signal than text).

Client side: when a `ChatMessage` has `audioUrl` set, `MessageBubble` renders a `VoicePlayer` instead of plain text. Custom controls: charcoal play/pause button, thin progress bar, duration label, "voice memo" sub-tag. iOS-safe `audio.play()` with exception handling.

### Tap-reply chips — Sean's proactive daily prompts

`ChatMessage.chipOptions` is a JSON array of `{label, value}`. When set + `chipsRepliedAt` is null, the bubble renders chip buttons below the text. Tap → sendToSean fires with the chip's value AND `chipMessageId`. Server stamps `chipsRepliedAt` on that row so chips collapse server-side. Same delayed-reply mechanic from there — AI auto-reply queued.

### 3x/day Sean check-in cron routes

Three new routes, each gated by `CRON_SECRET`:

- `/api/cron/morning-checkin` ~8 AM CT (Railway cron: `13 0 * * *` UTC)
- `/api/cron/midday-checkin` ~1 PM CT (`18 0 * * *` UTC) — only fires for clients with NO MealLog today
- `/api/cron/evening-checkin` ~8 PM CT (`1 1 * * *` UTC)

Shared logic in `src/lib/sean-daily-checkins.ts`:
- Pulls active clients
- 4-hour cooldown: skip if any COACH message landed in the last 4h (avoids piling pings on top of Monday batches / sean-messages crons)
- Midday only: also skip if she already logged today
- Picks today's variant from the message bank in `src/lib/sean-daily-prompts.ts` (4-5 variants per slot, deterministic-by-date rotation)
- Creates a COACH `ChatMessage` with `chipOptions` set + `category="daily_checkin"`
- Pushes the client

Coexists with the existing `sean-messages` hourly cron and `monday-checkin` weekly cron. No conflict — the 4h cooldown protects against double-pings.

### Time-aware dashboard ritual

`/dashboard`'s first surface is now a time-aware card that adapts based on the current Central hour:

- **Morning** (6-11 AM): "Good morning, Maya. Today's one thing: hit your protein floor." Focus picked from yesterday's data via `pickMorningFocus` (protein floor missed → protein focus; low steps → movement focus; else → "stack another clean day").
- **Midday** (11 AM-5 PM): "Half the day, Maya." + calorie/protein progress bars + "Log a meal" CTA (only when no log today).
- **Evening** (5-11 PM): "How'd today land, Maya?" — opens the close-out flow.
- **Night** (11 PM-6 AM): quiet "Rest up, Maya. Tomorrow's the lock." — no ask.

Logic in `src/lib/ritual-of-day.ts`. The old static greeting + day quote both retired — generic motivational quotes didn't earn the screen space.

### Presence indicator

Small pill below the ritual card: **"● Tracy and Adrienne are in RIVEN right now."** Reads `User.lastDashboardSeenAt` (stamped on every `loadDashboardData` call); active = stamped within the last 15 min. First names only. Self-hides when empty — never shows "you're alone." `src/lib/presence.ts` + `src/components/presence-indicator.tsx`.

### First names everywhere in the collective counter

`Together · this week` card was aggregate numbers (`"4,210g protein"`). Now reads as sentences with first names: `"Tracy, Maya, you + 4 others stacked 4,210g of protein this week."` Viewer's name swapped to "you" and moved to the end of the list. 4+ names truncate to first 3 + "N others." Same four stats (protein g, streak days combined, roses sent, steps walked). `src/lib/collective-counter.ts` returns contributor name lists in addition to aggregates.

### Peer wins broadcast

The mirror of cheer prompts. When a peer hits a milestone TODAY, every other active client sees a "Someone's crushing it" card with a one-tap 🌹 send button. Triggers in `src/lib/peer-wins.ts`:

- `win_streak_30` / `win_streak_60` / `win_streak_90` — meal-log streak ending today hit one of those round numbers
- `win_monthly_checkin` — she submitted her monthly check-in today

`CheerReaction.context` accepts the new `win_*` values; the cheer Zod schema in `dashboard/cheer-action.ts` was extended. Hard-day cheers and win cheers coexist in the same table.

### Falling-roses ceremony

When a client opens `/dashboard` with unseen `CheerReaction` rows (created since her `cheersLastSeenAt`), a cinematic full-screen overlay plays:

- First-ever ceremony: welcome banner — *"These RIVEN women are thinking about you. They're here with you."* (Holds ~2.8s.)
- Then each rose falls from above, lands center-stage, the sender's first name fades in ("Tasha is thinking of you"), then both fade. ~2s per rose.
- Cap at 6 roses with names; 7+ → overflow line *"…and N more this week from women you'll see in the room."*
- "Lock it in" button at end → overlay dismisses → `markCheersAsSeen` action bumps `cheersLastSeenAt` and sets `firstCheerCeremonySeenAt` if null.
- Tap anywhere mid-sequence → skip to dismiss button.

`src/components/cheer-ceremony.tsx` + keyframes `riven-rose-fall` / `riven-rose-name` in globals.css.

### Cheer mechanics — gating + softening

- **No-log triggers gated to 2 / 4 / 6-day rungs** instead of continuous after 24h. The card only fires on those exact gaps. Single-day-late and 3/5/7+ day silence → no prompt. Logic in `src/lib/cheer.ts`.
- **Way-over target now requires 3 days running** (not 1). A one-off heavy Saturday is normal life; a pattern earns peers the chance to send a 🌹.
- **Card copy softened**: "Maya hasn't logged" (no "in 24 hours" timestamp). "Maya's been heavy 3 days running."
- **Falling-roses sender copy**: each rose says "Tasha is thinking of you" — first name + present tense, warm.
- **CheerReceivedCard subtitle** rotates context: "Sent because she saw you show up on a heavy day" / "she saw you come back" / "she saw you stay in it" / "she wanted you to know she's rooting for you." Reframes the subject as her SHOWING UP, not as the failure that triggered the rose.

### Daily mood ribbon → "How's your day going?"

Top community surface on `/dashboard`. Four emojis: 😤 tired / 🥱 blah / 🤩 good / 🔥 fire (good emoji was upgraded from 🙂 to 🤩 mid-sprint).

Flow:
1. Buttons visible until she taps. Heading: **"How's your day going?"**
2. Tap → emoji floats up (`riven-float-up` keyframe) → ribbon collapses after ~600ms → Sean-voice coach line lands matched to her mood. Lines deterministic per (user, day, mood) so the surface doesn't shuffle on revisits. Bank in `src/lib/coach-mood-lines.ts` (5-6 lines per mood, 24 total).
3. Follow-up tap: **"What's making it ___?"** with mood-specific chips:
   - 😤 tired: sleep · period · stress · work
   - 🥱 meh: motivation · sleep · weather · vibes
   - 🤩 good: workout · food · a win · vibes
   - 🔥 fire: workout · momentum · a win · locked in
4. After she picks (or skips) the cause: **community poll bars** pop in, hold ~4 seconds, fade out. Shows the room's mood split as percentages ("50% said good"), her own bar in gold.

Stored as `DailyMood` rows. `User.cause` enforces per-mood validation server-side in `setMyMoodCause` action. Mood history surfaces on `/profile` and the coach's `/coach/clients/[id]` Overview tab as a 30-day heatmap + tally + cause breakdown.

### Sunday ritual — three rotating tap formats

Retired the open written-answer prompt. New rotation:

- **`pulse`** — 3 tap options, bar-chart fills with the room's split
- **`this_or_that`** — 2 side-by-side cards, percentages reveal after pick
- **`is_this_you`** — 1 relatable line + 3 confession-style reactions (e.g., 😤 me / 🙏 been there / 🌿 not anymore)
- **`open`** — legacy free-text format, replay-only for historical prompts

Auto-rotates per week (pulse → this_or_that → is_this_you). Sean can override per prompt in `/coach/profile` → Sunday prompt editor. Schema: `SundayPrompt.kind` + `options Json`. `SundayPromptAnswer.choice` (the option key tapped); `body` nullable for legacy.

### Pulse feed → spontaneous toast pop-ups

Persistent "Right Now in RIVEN" strip retired. New `PulseToasts` is a fixed-overlay toast at the top of `/dashboard` that surfaces one pulse event at a time, randomly while she's on the page: "Tracy just logged a meal" → fades 5s → next event ~60-120s later. Shopify "someone just bought" pattern. Pulse meal copy was also neutralized: no "late meal" framing, no food name in the toast, just "Tracy just logged a meal."

### Monthly check-in cadence (was weekly)

`/check-in` now stores month-start dates in `WeeklyCheckIn.weekStart` (column name is historical; renaming it would churn a lot). Fires on the 1st of each month. The `sunday-reminder` cron route was repurposed to fire only on the 1st (it no-ops every other day — schedule unchanged on Railway side). `lib/progress.ts` `countConsecutiveMonths` replaces the old `countConsecutiveWeeks`. `/profile` shows monthly check-in card; "checked in this month" replaces "checked in this week." Pricing copy, notification opt-in copy, tutorial slide all swapped.

### Calorie estimation — buffer 20% + explicit numbers are gospel

- Flat buffer dropped from 35% → **20%**.
- Cultural food baselines in `anthropic.ts` + `chat-prompt.ts` recalculated to be 20%-cushioned (multiplied by 1.20/1.35, rounded clean).
- **Explicit-number override removed.** When she states a specific calorie count, the AI uses that number 100% of the time. No buffer. No "implausibility override." She said the number — log it.

### Meal log UX — chill, no red

- Red exclamation icon removed from `MealRowItem` and the `ResultCard` "Heads up" card. The card stays but uses the same gold-tinted treatment as our reminder cards — soft, not alarmist.
- `flagReason` cap tightened from 1 sentence / 60 words → **1-2 sentences / 40 words max**. Voice: "you might not wanna make this a daily thing" energy, not "STOP."

### Chat UI polish

- "Riven · Ask me anything" header → small Sean avatar chip + "Sean · Your coach" eyebrow.
- "Message RIVEN…" placeholder → "Message Sean…"
- Empty state copy rewritten in Sean's voice: *"Say what's on your mind. Quick question, meal you're unsure about, a hard day — Sean reads everything. He answers in a few minutes most of the time. Tap the photo icon to share a meal pic."*
- Copy button on bubbles removed (texting Sean shouldn't have a copy affordance).
- Suggested-prompts grid retired (was AI-specific; doesn't fit the unified thread).

### Dashboard chill-pass (latest)

- Day name + daily quote sub-line removed from `/dashboard` (was below the time-aware ritual; generic motivational quotes didn't earn the space).
- Presence indicator promoted from inline italics to its own subtle pill below the ritual card.

### Profile chill-pass (latest)

`/profile` got significantly quieter:
- **Removed**: phase indicator (Phase 1 · Active), weight trend sparkline, waist trend sparkline, streak protection card, "This week's prompt" content card.
- **Kept**: Wins, photo timeline, mood history, monthly check-in card, notifications, billing, account.

The streak-freezes data column (`Profile.streakFreezesAvailable`) still exists in the DB for future use; only the surface is gone.

### Quiz fixes

- **Q15 ("Anything else I should know?") textarea removed.** Was broken on mobile and unused downstream. Total question count 15 → 14. Q14 is now the last step; selecting an option reveals the "See my results" submit button. Schema field still accepted as `optional` for one release so stale clients don't 400.
- **Back button moved up** from the bottom footer to directly below the answer area on every non-zero step. No more scrolling to correct a tap.
- Tailwind tokens fixed: `display-md` and `display-sm` were used across multiple pages but never defined in tailwind config. Added the missing tokens (32px / 40px) plus a new `display-xl` (56px) for the dramatic `/quiz` hero. Hero on `/quiz` is now `text-display-md md:text-display-xl` and properly fills the screen on mobile.
- **Coach `/coach/leads`** got a two-tap-confirm delete button per row (`DeleteLeadButton`).
- `/quiz/results/[id]` next-step copy tightened across all three buckets (APP / COACH / DONE_FOR_YOU). All three now end on a curiosity hook — *"Twelve minutes will show you why / what's in it."*
- **Voices section** on `/quiz` dropped the time taglines under each testimonial. Just first names now.

### What Sean still needs to do manually

- **Cron-job.org or Railway worker service for `/api/cron/process-ai-replies`** — fires every minute, drains the PendingAiReply queue. Without this, AI auto-replies on the Sean thread queue forever. Sean is leaning toward a Railway worker service (Option A in the most recent chat).
- **3 new Railway cron services for the daily check-ins**:
  - `morning-checkin` — `13 0 * * *` UTC → POST `/api/cron/morning-checkin`
  - `midday-checkin` — `18 0 * * *` UTC → POST `/api/cron/midday-checkin`
  - `evening-checkin` — `1 1 * * *` UTC → POST `/api/cron/evening-checkin`

  Duplicate the `sunday-checkin` service pattern; reference `${{rivenaiapp.CRON_SECRET}}` for the secret.

---

## Session updates (since c88dfda — through 2026-05-22)

This section captures everything built across the May 2026 build sessions. The schema / route map / architecture sections further down are still mostly accurate as the "base" of the project; this is the delta. Read this FIRST before working on any feature mentioned below — the older sections may not reflect the most current behavior.

### New brand frame: [BRAND.md](./BRAND.md)

The emotional core. *"Peaceful discipline. Steady wins."* Every copy line, screen, and feature should pass the test: **"Does this feel like peaceful discipline?"** No bouncy animations, no fitness-bro energy, no diet-industry hype. Read BRAND.md before writing for RIVEN.

### Working-style rules (updated)

- **UI/UX ideation gets ASCII wireframes, not JSX** (a rule the user explicitly stated; corrected mid-session from an earlier JSX rule). Each option in `┌─┐ │ └─┘` boxes with real labels, real button text.
- **Label options A / B / C / D.** Sean compares by letter.
- **Always include a recommendation** when proposing options. Not "you tell me." My pick + the main tradeoff.

### Schema additions

New migrations on top of the existing list (newest at top):

```
20260522130000_add_sunday_ritual         -- SundayPrompt + Answer + Reaction
20260522120000_add_cheer_reaction        -- peer-to-peer 🌹
20260520120000_add_daily_calorie_schedule -- Profile.dailyCalorieSchedule Json?
20260519130000_add_streak_freezes        -- Profile.streakFreezesAvailable Int @default(1)
(earlier in session — Lead model for the quiz funnel; check migrations folder for exact name)
```

New / extended models:
- **`Lead`** — quiz funnel captures (firstName, email, phone, score 0–100, budgetTier, answers Json, country, createdAt). Used by `/coach/leads`.
- **`CheerReaction`** — `(recipientUserId, senderUserId, context)` unique. Contexts: `"no_log_24h" | "broke_streak" | "way_over_target" | "manual"`.
- **`SundayPrompt`** — one per ISO weekStart. **`SundayPromptAnswer`** — one per (prompt, user). **`SundayPromptReaction`** — one per (answer, user, kind). Kinds: `"rose" | "strong" | "leaf"`.
- **`Profile.streakFreezesAvailable`** (Int, default 1) — Duolingo-style freeze. Schema + UI ship; auto-spend logic is the follow-up.
- **`Profile.dailyCalorieSchedule`** (Json?) — `{Sun, Mon, Tue, Wed, Thu, Fri, Sat → int}`. When set, `getTodayCalorieTarget(profile)` from `src/lib/calorie-schedule.ts` returns today's value; falls back to flat `cutCalories`. Honored by /dashboard, /log meal pipeline, and /chat live context.

### New routes

Public funnel:
- **`/quiz`** — editorial landing (hero anchor with gold rules + ◆ ornament, typographic pillar columns, Sean portrait + drop-cap bio, pull-quote testimonials, optional client portrait spread that renders when `/public/icp-portrait.{jpg,png,webp}` exists, Soul Food cheat-sheet card with real thumbnail, Final CTA, freebie lead-magnet, footer)
- **`/quiz/start`** — 15-question flow
- **`/quiz/results/[id]`** — animated score (0–100) meter + 3 insights + temperature-aware CTA. Score = (q1–q10 yes × 7) + Q14 weight (0/10/20/30)
- **`/quiz/vsl`** — YouTube unlisted embed (currently `RAh9NfU3o5Y`). `VSL_EMBED_URL` const in `src/app/quiz/vsl/page.tsx`.

Coach:
- **`/coach/leads`** — quiz lead dashboard with tier filter chips, expand cards, mailto/sms quick actions, per-lead delete.
- **`/coach/clients/[id]`** rebuilt with 5 pill tabs (Overview / Meals / Trends / Chat / Weekly). Includes the 28-day color-coded meal calendar with tap-to-expand days and the "probably incomplete" `?` badge on days where she logged 1–2 meals AND total < 60% of target.

### Architecture decisions (new)

**Quiz funnel routing — Q14 picks lane, score picks on-ramp.**
The result-page CTA in `src/lib/quiz.ts > nextStepFor(tier, score, firstName)`:
- `FREE` (PDF guide) → `/downloads/20-pound-truth.pdf`
- `APP` + score ≥ 75 → `/sign-up` direct
- `APP` + score < 75 → `/quiz/vsl` → then `/sign-up`
- `COACH` (any score) → `/quiz/vsl` → then `/sign-up`
- `DONE_FOR_YOU` (any score) → `/quiz/vsl` → then `/sign-up`
Secondary "Watch the 7-min breakdown" link hidden when the main CTA already routes there.

**Coach roster three-bucket layout.** `/coach/clients` shows: "Today" strip (logged vs quiet, Central-time day), "Needs you" cards, "Doing well" cards, "Everyone else" plain list. Logic in `src/lib/coach-triage.ts`. The bucketed approach is per Sean's explicit preference — replaced an earlier flat triage feed.

**Coach client detail = 5 pill tabs.** Single page, tabs persist in URL search param `?tab=`. Lives in `src/app/(clerk)/(coach)/coach/clients/[id]/page.tsx` + `src/components/coach-client-tabs.tsx`.

**Calorie cycling per client.** When `Profile.dailyCalorieSchedule` is non-null, every consumer of `cutCalories` reads `getTodayCalorieTarget(profile)` instead. Wired into /dashboard, /log meal pipeline, /chat live context. Coach editor lives on `/coach/clients/[id]` Overview tab in the Profile section.

**Per-client comp + bulk comp.** `setClientComp` and `compAllExistingClients` server actions in `src/lib/coach-actions.ts`. UI: `/coach/clients/[id]` per-client toggle, `/coach/profile` bulk button (two-step confirm). Stripe webhook still skips `subscriptionStatus="comped"` on update.

**Ambient community trio on /dashboard.** Three surfaces above "Today", each self-hiding on empty data:
- **`PulseStrip`** — derived activity feed from MealLog + WeeklyCheckIn + computed streaks. 12h window, max 6 events, viewer's own activity filtered out. First names always.
- **`CollectiveCounter`** — aggregate stats across active+comped clients (meals this week, protein hits today, steps this month, lbs lost combined). Stat hides when zero.
- **`CheerPrompts`** — system auto-detects hard-day candidates (no log 24h+, broke 3-day streak, total > target × 1.5 yesterday). One tap creates a `CheerReaction` row + push notification to her.
Helpers: `src/lib/pulse.ts`, `src/lib/collective-counter.ts`, `src/lib/cheer.ts`. Server action: `src/app/(clerk)/(app)/dashboard/cheer-action.ts`.

**Sunday Daily Ritual.** Fourth community surface, also on /dashboard. Coach writes one weekly question at `/coach/profile`; appears at top of every active client's dashboard on Sunday with composer + others' answers + 🌹/💪/🌿 reactions. "Open" = today's Central day is Sunday; otherwise replay-only (UI disables buttons). Surface lingers on Mon-Sat if anyone participated. Helpers: `src/lib/sunday-ritual.ts`. Server actions: `src/app/(clerk)/(app)/dashboard/sunday-actions.ts` (`submitSundayAnswer`, `toggleSundayReaction`). Coach action: `setSundayPrompt` in `coach-actions.ts`.

**RIVEN AI used to read live data + write meals via tool use.** `/api/chat/stream` injected a fresh client context every turn (today's totals, recent meals, latest check-in, current streak). Claude had a `log_meal` tool that called `analyzeMeal` and persisted via the same pipeline as `/log`.

**[SUPERSEDED 2026-05-27 — RIVEN AI as a destination is retired.]** `/chat` is now the unified Sean thread; the streaming route + log_meal tool still exist in the codebase but aren't called from the new client UI. Meal logging happens via `/log` only. The same Claude persona + live context now powers the delayed auto-reply scheduler (`src/lib/sean-auto-reply.ts`) instead of the live stream.

**Streaks 14/30/60/90.** Variant banks added to `sean-message-variants.ts` (45 new lines + 28 new titles). Engine in `sean-messages.ts` picks the HIGHEST applicable milestone; window expanded from 30 → 100 days to support 90-day detection.

**Streak freeze foundation.** Profile column + UI on `/profile`. Auto-spend logic in `sean-messages.ts` is the follow-up — schema/UI ships, behavior lands next.

**Sunday recap push.** New cron route `/api/cron/sunday-recap` — personalized weekly recap push for every active client. Suggested Railway cron: `30 13 * * 0` UTC (Sun 8:30 AM CDT). **Not yet wired up as a Railway service** — duplicate the existing `sunday-reminder` service pattern.

**`/pricing` escape hatch.** Moved into the `(clerk)` route group so it lives inside `ClerkProvider`. Header now shows "Signed in as X" + Clerk `<SignOutButton>` for any signed-in user. When signed in but not subscribed, a diagnostic panel surfaces role + subscriptionStatus so Sean (or any client) sees WHY the paywall fired.

**PwaInstallBanner rebuilt around install videos.** `/public/videos/install-iphone.mp4` + `install-android.mp4`. Banner copy says "watch this video to install" instead of textual steps. 3-day escalation logic.

### Meal logging behavior (current state)

- **Flat 35% overestimation** above any inferred baseline. **[SUPERSEDED 2026-05-27 — now 20%; see top-section calorie note.]**
- **Explicit calorie numbers trusted as-is.** If she says "the label said 290 cal," log 290 with no buffer.
- **Implausibility override.** If she claims "Big Mac at 100 cal," AI overrides with the honest number and a one-line "real talk, that's closer to 720."
- **Incremental tightens only** ("medium fry next time," not "eat a salad"). NEVER cross food categories or use diet-culture moves.
- **Cultural baselines pre-cushioned** at the +35% level — don't double-apply.
- **flagReason word caps:** 1 sentence, 60 words max. `coaching`: 2-3 sentences, 75 words max.
- **Items breakdown** (per-meal items array) — pre-existing, still active.

### Logo + PWA icons

Current `/public/riven-logo.png` is the **Canva RIVEN oval wordmark** (black on transparent — white background chroma-keyed out via sharp pixel-walk). PWA icons (192/512/180) regenerated from logo on cream `#FAF7F2` with ~12% padding.

To swap logos: drop the new file at `/public/riven-logo.png` and re-run the regenerate-PWA-icons sharp snippet (see commits `c9dc10c` for heron version or `cf3bc1f` for Canva for the exact node-e command).

### Things Sean still needs to do manually

- **Set up the Sunday-recap Railway cron service** (duplicate `sunday-reminder`, change endpoint to `/api/cron/sunday-recap`, schedule `30 13 * * 0` UTC).
- **Drop `/public/icp-portrait.jpg`** to activate the client portrait spread on `/quiz`. Section gracefully hides until it lands.
- **Write the first Sunday prompt** at `/coach/profile` → Coaching tools → Sunday prompt — otherwise the ritual surface doesn't appear.
- **YouTube unlisted VSL embed settings:** confirm `Allow embedding` is checked; comments off; like/dislike off (set during upload at YouTube Studio Show-More → Comments and ratings).

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
  - `kind=AI` is the LEGACY AI-thread bucket — no longer rendered anywhere as of 2026-05-27. New auto-replies use `kind=COACH` with `aiGenerated=true`.
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

- `/dashboard` — home. **[CURRENT 2026-05-27]** Time-aware ritual card at top (morning/midday/evening/night, see top-section notes), presence indicator pill, daily mood ribbon, Sunday ritual (Sundays only, rotating tap formats), cheer received card with rotating context line, peer wins, cheer prompts, pulse toasts (overlay), collective counter with first names, today's progress cards, sticky log pill. Coach-message chip stays top-right. **[RETIRED]** Rotating "Ask RIVEN" prompts hero, weekly Sunday check-in card, weekly content prompt card — all removed. Day name + daily quote sub-line — removed.
- `/log` — voice-first meal logging. Mic hero (big charcoal circle with mic icon) at the top; text input demoted into an "Or type it instead" disclosure. Tap mic → record → tap stop → Whisper transcribes → fills textarea → tap Log to submit. Result card includes a **soft-red "Heads up" pill with flagReason** when the meal contains processed/refined food, plus per-item pills showing how Claude split the meal. **Today section** below shows current Central-day meals — each card has a header (combined label + total cals + ⚠ icon if flagged) AND a row of per-item pills underneath; tap the header to re-log the whole combo, tap a pill to re-log just that food. Mic stream is reused across recordings in one session to reduce permission re-prompts. No more Frequent or Earlier-this-week sections — kept the UI focused on the current day (Sean's call).
- `/chat` — **the unified Sean thread**. Renders all `kind: "COACH"` messages chronologically. USER-role rows = her side, ASSISTANT-role rows = Sean side (whether real Sean or AI auto-reply; `aiGenerated` flag is invisible to clients). **[SUPERSEDED 2026-05-27]** — was previously the RIVEN AI chat filtered to `kind: "AI"`. Legacy `kind: "AI"` messages stay in the DB but no longer render here.
- `/messages` — coach inbox (kind: "COACH" only, 30-day window, marks seen on visit by writing `Date.now()` to `riven_seen_coach_msg_at` in localStorage)
- `/check-in` — **monthly** check-in form, keyed to month-start. Same 8-field shape (weight, waist, photos, sleep, cycle, menu adherence, stress, wins/struggles). Submitting queues a `VoiceMoment` for Sean to record a 60s voice memo. **[SUPERSEDED 2026-05-26]** — was previously weekly, Sunday-locked.
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
- `/api/cron/sunday-reminder` — **[REPURPOSED 2026-05-26]** Now a monthly reminder. Route name is historical (kept so Sean doesn't have to rewire the Railway cron). Date guard: no-ops every day except the 1st of the Central-time month. On the 1st, pushes check-in reminder to clients who haven't submitted yet for this month.
- `/api/cron/process-ai-replies` — POST, CRON_SECRET-gated. Drains the `PendingAiReply` queue. Designed to fire every 1 minute. Sean is leaning toward a Railway worker service (one always-on service running `setInterval(60_000)`); cron-job.org is the cheap external alternative.
- `/api/cron/morning-checkin` / `midday-checkin` / `evening-checkin` — POST, CRON_SECRET-gated. Sean's proactive 3x/day prompts with tap-reply chips. See top-section daily cron note.
- `/api/cron/monday-checkin` — POST, CRON_SECRET-gated. **Processes 5 clients in parallel** (was sequential, hit the route maxDuration on lists >20). `maxDuration` bumped to 800s as a safety net. Generates personalized Sean-voice check-ins via Claude (uses last 7 days of meal logs + chat history + profile) and posts as COACH messages with push notification. Same batch is also reachable from the coach profile button via a Clerk+role-gated server action.
- `/api/stripe/webhook` — signature-verified by `STRIPE_WEBHOOK_SECRET`. Listens for `customer.subscription.created/updated/deleted` and mirrors state into the User row. Never overwrites `subscriptionStatus="comped"`. Added to middleware's public route allowlist.
- `/api/stripe/portal` — auth-gated. Creates a Stripe Customer Portal session for the signed-in user and 303-redirects there. Called by the "Manage billing" form on /profile.
- `/api/admin/comp-clients` — CRON_SECRET-gated. Accepts `{ emails: string[] }` JSON, marks matching CLIENT users as `subscriptionStatus="comped"`. Idempotent. Used by Sean from terminal to comp new beta clients. Not exposed via UI.

### Server actions
- `src/app/pricing/actions.ts` → `startCheckout()` — lazily creates a Stripe Customer for the user, generates a Subscription Checkout Session with `subscription_data.trial_period_days: 7`, redirects to the Stripe-hosted form. The 7-day trial config lives on the Checkout session (NOT on the Price) so it can be changed without recreating the Price.

## Architecture decisions worth knowing

1. **[SUPERSEDED 2026-05-27]** Coach messages and AI messages used to be isolated — `/chat` filtered `kind: "AI"`, `/messages` filtered `kind: "COACH"`. Now `/chat` is the unified Sean thread (kind=COACH only); legacy AI rows stay in the DB but don't render. The "Message from Sean" home-screen badge with the 30-day visibility window still works the same way.

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

## Session recap (2026-05-31)

Three things landed this session. Pick up here:

### 1. Bug fixes — calorie target + meal-parse crash (commit `80208c8`)

- **Home vs Log showed different daily targets** (e.g. 2,000 vs 1,915) for calorie-cycling clients. `log/actions.ts` → `getTodayTotals()` was reading the flat `Profile.cutCalories`; the dashboard reads `getTodayCalorieTarget()` (schedule-aware). Both now use `getTodayCalorieTarget()`, so every surface agrees. (Sean should hard-refresh / reinstall the PWA to clear the old cached screen.)
- **Meal log crashed with a raw Zod blob** (`items.2.calories: too_small`) when the model emitted a *negative* number from arithmetic the client typed ("subtract 140 cal"). Fix is two-part: (a) a prompt rule in `src/lib/anthropic.ts` (under ESTIMATION RULES → "NEVER RETURN NEGATIVE NUMBERS") forbidding negative per-item/total values and telling the model to net the math into a non-negative result; (b) the catch in `log/actions.ts` now logs the real error server-side and returns a clean Sean-voice message — parse failures get "Couldn't read that one. Skip the math — just name what you ate and how much…". This was a code/schema bug, **not** a model-intelligence problem — meal logging stays on `claude-sonnet-4-6`.

### 2. Weekly-average calorie anchoring (commit `4a570b5`)

RIVEN coaches the **weekly average**, not any single day. Calorie cycling already existed (`Profile.dailyCalorieSchedule` JSONB, 7 day→cal values, resolved by `getTodayCalorieTarget()`), but there was no way to anchor the week to a target mean.

- **`src/lib/calorie-schedule.ts`** gained `weeklyAverageOf(schedule)` (mean rounded to 5), `shiftToAverage(schedule, target)` (slides every day equally so the mean lands on the target while keeping the high/low *shape*; clamps each day to `[MIN_DAY_CAL, MAX_DAY_CAL]` = 800/5000), and the exported `MIN_DAY_CAL` / `MAX_DAY_CAL` constants (kept in sync with the coach form inputs and `ScheduleDaysSchema` in `coach-actions.ts`).
- **Coach editor** (`/coach/clients/[id]` → `calorie-schedule-form.tsx`) now has a "Weekly average / day" input, a "Snap week to average" button, and a live readout that's **sage when the seven days land on her target** and **gold (with the over/under gap)** when they don't.
- **No schema change** — the seven stored day values remain the source of truth; the average is just the lens the coach sets them through.
- **Open follow-up Sean floated:** letting *clients* self-set their own weekly average (currently coach-only). Deliberately not built — clients freely changing their own deficit cuts against the coaching model. If Sean wants it, it's a new client-facing route + its own auth'd action; flag it as a product decision, not a quick add.

### 3. PostHog — where it actually stands

Analytics are fully wired and verified inlined in the live bundle (Plausible + PostHog). Engineering side is **done**. The funnel Sean built in the UI was "Pageview → Pageview" (any page → any page = meaningless 33%). What's left is purely PostHog-UI config, no code:

- Build **one real funnel** using the custom events we already emit: anonymous landing → `quiz`/VSL pageviews → `/pricing` → **`subscription_started`** (fires on the Stripe `success_url` `/dashboard?subscribed=1` via `SubscribedTracker`, under the identified person thanks to `PostHogIdentify`). Steps should be *distinct* events/URLs, not the same one twice.
- Session replay is ON (all inputs masked); set `NEXT_PUBLIC_POSTHOG_REPLAY=0` on Vercel to kill it.
- Empty dashboards are almost always an **ad blocker / Brave** blocking `posthog.com` / `plausible.io` — verify on a clean browser before assuming breakage.
- Real funnels need real traffic — let it collect for a few days before reading conversion rates.

### 4. Calorie banking — client-controlled "Smooth my week" lever

A self-serve lever on `/profile` (under a new **Calories** section). Default **OFF**; every existing client is unaffected. When she turns it on, today's target = her daily cut + whatever she banked or owed, rolled forward from the start of the week.

- **Model:** "carry to the very next day." Each completed day's leftover (`target − actual`) rolls into the next day. Undereat → tomorrow goes up; overeat → tomorrow goes down. Compounds correctly across the week but is always applied to the single next day, never spread. **Sunday is a clean reset** (target = base). Her **weekly average — the number Sean coaches — never changes**; only how the calories sit across the days does. Protein floor never moves.
- **Clamp:** today's number is held to `cutCalories ± 600` (`BANK_FLOOR_DELTA` / `BANK_CEILING_DELTA` in `calorie-schedule.ts`). Excess beyond the clamp is intentionally forgiven — one big under-eat can't become a 4,000-cal day, one blowout can't starve her tomorrow.
- **No-log days are neutral**, not zero. We can't tell a fast from a forgotten log, so a day with zero logged calories neither banks nor owes — the running bank just passes through. This closes the obvious footgun (forgetting to log ≠ free +600 tomorrow).
- **The coach sets the average, the client smooths it** (the two product decisions Sean locked). Banking uses the existing `cutCalories` as the base — **no new "average" field**. When banking is ON it **overrides** `dailyCalorieSchedule` (the per-day cycling schedule).

**Files:**
- `prisma/schema.prisma` + migration `20260531120000_add_calorie_banking` — one additive column `Profile.calorieBankingEnabled Boolean @default(false)`.
- `src/lib/calorie-schedule.ts` — pure `bankedTargetForToday({ base, priorActuals })` + the two clamp-delta constants. No DB, unit-testable.
- `src/lib/calorie-banking.ts` (new) — `getWeekDailyCalories(userId, now)` (per-day MealLog sums, Sun→yesterday, Central-time bucketed) and `resolveTodayCalorieTarget(userId, profile, now)` → `{ target, base, carryIn, banked }`. **This is the one call every read path should use now** — it honors banking → per-day cycling → flat cut, and never throws.
- **Wired into** `/dashboard` (the ring + a gold explainer line under "Today" when banking moved the number), `/log` (`getTodayTotals` + the meal-analyzer's "remaining" framing — so Home and Log never drift, same as the bug #1 fix), and the RIVEN AI chat (`buildClientContext` / `buildLiveContext` take an optional pre-resolved target; the stream route resolves it once and threads it in).
- `src/app/(clerk)/(app)/profile/calorie-banking-actions.ts` + `calorie-banking-toggle.tsx` — client-scoped server action (`updateMany` keyed on `clerkId`, can't touch another row) + an optimistic pill toggle in Sean's voice.
- Coach sees a read-only **"Smoothing: on/off"** field on `/coach/clients/[id]` → Profile grid.

**v2 candidates (deliberately not built):** a feast-day picker (pre-allocate Saturday high); weekly-budget spread instead of next-day-only; only banking from days with a *minimum* logged threshold (the no-log guard handles the worst case, but a 200-cal "I only logged a snack" day still banks ~+600 — consistent with the app's trust-her-logs model, but worth revisiting). All would be additive.

---

End of handoff. Coding agent: read this top to bottom before suggesting changes. Ask if anything is ambiguous before editing. **Read `CLAUDE.md` too** — it has the design + voice rules that aren't repeated here.
