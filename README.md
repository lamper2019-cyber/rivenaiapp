# RIVEN

Premium mobile-first coaching app for women on a body recomposition journey.

> **Status:** Phase 1 — Foundation. Tailwind brand tokens, Clerk auth, Prisma schema, base layout with bottom navigation, and the welcome screen are wired up. The dashboard, log, chat, and profile tabs are stubs that will be filled in subsequent phases.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS — brand tokens map to DESIGN.md (cream, charcoal, gold, sage, soft red) |
| Fonts | DM Serif Display (display) + Plus Jakarta Sans (body), via `next/font/google` |
| Database | Postgres on Railway, accessed via Prisma |
| Auth | Clerk (`@clerk/nextjs` v5) |
| File storage | Cloudflare R2 (S3-compatible), via `@aws-sdk/client-s3` |
| AI | Anthropic Claude (`@anthropic-ai/sdk`), all calls server-side |
| Mobile | PWA — manifest + service worker, installable on iOS/Android |

## Local setup

### 1. Install dependencies
```bash
cd riven-app
npm install
```

### 2. Provision external services and copy credentials into `.env.local`

```bash
cp .env.example .env.local
```

Then fill in the four sets of credentials.

#### a. Railway Postgres
1. Sign in at [railway.app](https://railway.app) and create a new project.
2. Click **+ New** → **Database** → **PostgreSQL**.
3. Open the Postgres service → **Connect** tab → copy the **Postgres Connection URL**.
4. Paste it into `DATABASE_URL` in `.env.local`.

#### b. Clerk
1. Sign in at [clerk.com](https://clerk.com) and create a new application.
2. Choose **Email** + any social providers you want to enable.
3. From **API Keys**, copy:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`
4. Under **Paths**, set sign-in to `/sign-in` and sign-up to `/sign-up` (matches `.env.example`).

#### c. Anthropic API
1. Sign in at [console.anthropic.com](https://console.anthropic.com).
2. **API Keys** → create a new key → copy into `ANTHROPIC_API_KEY`.

#### d. Cloudflare R2
1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) → **R2 Object Storage**.
2. **Create bucket** named `riven-uploads` (or your preferred name → set `R2_BUCKET_NAME`).
3. **Manage R2 API Tokens** → create a token with **Object Read & Write** scoped to that bucket.
4. Copy the **Account ID**, **Access Key ID**, **Secret Access Key**, and **Public R2.dev URL** (or your custom domain) into the matching env vars.

### 3. Run Prisma migrations against Railway Postgres
```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. Start the dev server
```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). The landing page is public; everything else redirects to Clerk sign-in.

## Design system

The brand palette lives in `tailwind.config.ts`. The Stitch mockups in `~/Downloads/stitch_riven_premium_coaching_app/` use Material-3 token names (`primary`, `surface`, `on-surface-variant`, etc.); the Tailwind config maps those names to the RIVEN brand colors so the mockup HTML translates 1:1.

**Brand colors** (from `riven_narrative/DESIGN.md`):
- `cream` `#FAF7F2` — base background
- `charcoal` `#1A1A1A` — primary text + buttons
- `gold` `#C9A961` — hero accents (used sparingly)
- `sage` `#7C9A7E` — success / "complete" states
- `soft-red` `#C76B5C` — alert / error states

**Typography:**
- `font-display` → DM Serif Display (headings, editorial authority)
- `font-body` → Plus Jakarta Sans (body, modern sans)

## Project structure

```
src/
  app/
    layout.tsx                  # ClerkProvider, fonts, theme color
    page.tsx                    # Welcome screen (public)
    globals.css                 # Tailwind + base styles + .glass-card utility
    sign-in/[[...sign-in]]/     # Clerk sign-in
    sign-up/[[...sign-up]]/     # Clerk sign-up
    (app)/                      # Auth-protected route group
      layout.tsx                # Bottom-nav layout
      dashboard/                # Phase 2: daily targets + quick actions
      log/                      # Phase 2: meal logging via Claude
      chat/                     # Phase 3: RIVEN AI conversation
      profile/                  # Phase 4: progress graphs + photo timeline
      onboarding/               # Phase 2: profile capture + target calc
  components/
    bottom-nav.tsx              # Glass-blur bottom nav (Home/Log/RIVEN AI/Profile)
    sw-register.tsx             # Service-worker registration (prod only)
  lib/
    prisma.ts                   # Prisma client singleton
    calculations.ts             # Mifflin-St Jeor + protein floor logic
  middleware.ts                 # Clerk route protection
prisma/
  schema.prisma                 # User, Profile, MealLog, DailyTotals, WeeklyCheckIn,
                                # ContentSubmission, ChatMessage
public/
  manifest.json                 # PWA manifest
  sw.js                         # Service worker
.env.example
```

## Roadmap

- **Phase 1 (done)** — Foundation: scaffolding, design system, auth, schema, base layout, welcome screen.
- **Phase 2** — Onboarding form + daily dashboard + meal logging with Claude.
- **Phase 3** — RIVEN AI chat, Sunday check-in flow, R2 photo uploads.
- **Phase 4** — Content prompts, progress graphs, wins generation.
- **Phase 5** — Coach dashboard (Sean's view), client detail screens, messaging.

## PWA install (iOS / Android)

1. Visit the deployed URL in mobile Safari (iOS) or Chrome (Android).
2. iOS: tap **Share** → **Add to Home Screen**.
3. Android: Chrome will prompt **Install RIVEN** automatically; otherwise, menu → **Install app**.

The service worker is only registered in production (`NODE_ENV === "production"`), so dev iterations don't get cached.

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway, **New Project** → **Deploy from GitHub** → select the repo.
3. Add a **PostgreSQL** plugin in the same project (the `DATABASE_URL` env var auto-injects).
4. Add the rest of the env vars from `.env.example` to the Railway service.
5. Railway auto-detects Next.js and runs `npm run build` + `npm start`.

## License

Proprietary — RIVEN coaching program.
