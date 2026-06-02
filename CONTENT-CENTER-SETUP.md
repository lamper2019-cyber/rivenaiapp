# Content Command Center (/coach/insights) — setup status

Last touched: 2026-06-01 — **WORKING** (via Instagram Login pivot)

## ✅ DONE & VERIFIED
- DB migration applied to Railway (`IgPost`, `IgPostMetric`, `IgAccountSnapshot`)
- Code built + typechecks clean
- **PostHog funnel half** — personal API key (`POSTHOG_PERSONAL_API_KEY`, scope
  Query Read) + `POSTHOG_PROJECT_ID=448237`. Verified against live API.
- **Instagram content half — WORKING.** Pivoted from Facebook-Login to the
  **Instagram API with Instagram Login** (host `graph.instagram.com`) because
  @itsseanwilliams lives under a different Facebook account than the Meta app,
  which made the Facebook-Login + Page path unworkable. Instagram Login
  authorizes the IG account directly — no Page, no app secret, no account
  matching.
- Ran a one-off sync (`scripts/sync-ig-once.mjs`) → **30 posts + insights now
  in the live DB.** Top post: 3,255 reach. Followers: 1,145.

## The single env var
- `INSTAGRAM_ACCESS_TOKEN` — long-lived (60-day) Instagram Login token. That's
  it. The daily cron refreshes it via `ig_refresh_token` (no secret needed).
- Token currently saved in local `.env`. **Must also be set on Railway** for
  production sync/page.

## TO GO FULLY LIVE IN PRODUCTION
1. Deploy the new code (commit + push → Railway auto-deploys).
2. On Railway, set env vars: `INSTAGRAM_ACCESS_TOKEN`,
   `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID=448237`.
3. Add the daily cron (cron-job.org or Railway), same pattern as the others:
   `POST https://rivenmethod.com/api/cron/sync-instagram`
   `Authorization: Bearer $CRON_SECRET`  ·  daily, e.g. `0 9 * * *`
4. Visit `/coach/insights` → data already shows (DB is populated); "Sync now"
   refreshes on demand.

## Known follow-up (not blocking)
- **Token persistence:** the cron refreshes the 60-day token but only LOGS the
  new value (no secrets store to write back to). Before day ~55, rotate
  `INSTAGRAM_ACCESS_TOKEN` on Railway from the cron log — OR add a small DB-
  backed token store so refresh is fully hands-off. Low urgency (60-day window).
- **Per-post funnel attribution** (quizStarts/trials per post) needs trackable
  links (utm_content=`ig_<id>`) on posts/stories. Sean's current posts use
  "Comment STORY" not links, so per-post funnel stays empty until link-based
  CTAs are used. Account-level funnel (THIS WEEK strip) works regardless.
- **Phase 3 — VISION (proven 2026-06-01, ready to build in):** Sean's content
  is mostly silent (captions on screen, no talking), so Whisper/audio is
  useless. Solution proven end-to-end: IMAGE → read media_url directly; VIDEO →
  `ffmpeg-static` (bundled, added to deps) extracts ~4 frames → Claude vision
  (`claude-sonnet-4-6`) reads on-screen text + visuals → returns
  {hook, onScreenText, visualSummary, contentType, whyItWorks}. Test harness:
  `scripts/test-vision.mjs`. TO BUILD: add IgPost.visionSummary + contentType
  fields, formalize into `lib/vision.ts`, enrich via cron/button, then wire the
  features below.
- **Features to add (all server-side, no Sean setup):** B = "what to post next"
  (seed riven-content-generator with winning hooks/topics); C = hook swipe file
  (rank opening lines by reach); D = Monday digest push. A = per-post breakdown
  UI (uses the vision fields).

## Account facts (for reference)
- RIVEN IG: @itsseanwilliams · ig id `17841400082866724` (insights node) /
  `36369094286037265` (token `me` id) · MEDIA_CREATOR · ~1,145 followers
- Meta app "RIVEN Insights" App ID `885885254386025` (only used to mint the
  IG-login token; not needed at runtime)
