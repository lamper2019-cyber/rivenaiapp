# RIVEN — App Store submission pack

Everything you paste into App Store Connect, plus the exact clicks. Do the
steps in order. Copy-paste blocks are marked `▼`.

Assumes the build is already archived + uploaded to TestFlight (see
[IOS-BUILD.md](./IOS-BUILD.md) steps 6). These are the four things only you can
do, in the order you'll actually do them.

---

## STEP 1 — Create the reviewer's demo account (do this first)

The app is **sign-in only behind a paywall**. Apple's reviewer can't sign up or
pay inside the app, so you hand them a working account. Without this you get an
automatic rejection ("we were unable to sign in").

1. On the **web** (not the app), go to `https://rivenmethod.com/sign-up`.
2. Create an account with an email you control. Suggested:
   - **Email:** `appreview@rivenmethod.com` (or any inbox you own)
   - **Password:** something strong you'll paste into review notes verbatim.
3. **Complete onboarding** for that account (age, height, weight, goal, etc.) so
   the reviewer lands in a real, populated app — not an empty shell. This also
   helps you pass Guideline 4.2 (minimum functionality).
4. **Log a couple meals** and do one check-in on that account so the dashboard,
   /log, and progress screens have data to show.
5. **Comp the account so it bypasses the paywall:**
   - Sign in as Sean (coach) → `/coach/clients` → open the demo client →
     flip the **Comp** toggle ON. That sets `subscriptionStatus = "comped"`,
     which bypasses `/pricing` forever.
6. Sign out. You're done — that account now opens straight to the dashboard.

> Keep the demo account active. If you ever un-comp it, the reviewer hits the
> paywall and you fail review.

---

## STEP 2 — Verify in-app sign-in on TestFlight (the make-or-break check)

Install the TestFlight build on your phone, then:

1. Open RIVEN from TestFlight.
2. On the sign-in screen, confirm you see **email sign-in** (email + password or
   email code). Google is intentionally hidden in the app — that's correct.
3. Sign in with the **demo account** from Step 1. You should reach the dashboard.
4. Tap into **/log** and try the **mic** and **camera** once — confirm the iOS
   permission prompts fire (those prove the native features for Guideline 4.2).
5. Go to **Profile** and confirm **"Delete account"** is visible (Apple requires
   in-app account deletion — it's there, just confirm it renders).

If the sign-in screen shows **no email option** (social-only), stop and tell me —
that's a Clerk dashboard config fix, not a code change.

---

## STEP 3 — App Privacy label (App Store Connect → your app → App Privacy)

Click **Edit**, answer the questionnaire. Based on `rivenmethod.com/privacy`:

**Do you or your partners collect data? → Yes.**
**Do you use data to track users? → No.** (RIVEN does not track across apps/sites;
the privacy manifest already declares `NSPrivacyTracking = false`.)

Declare these data types. For **every** one: **Linked to the user = Yes**,
**Used for tracking = No.**

| Data type (Apple category)        | What it is in RIVEN                          | Purpose to select            |
|-----------------------------------|----------------------------------------------|------------------------------|
| **Contact Info → Email Address**  | Login email (via Clerk)                       | App Functionality            |
| **Health & Fitness**              | Weight, waist, goals, activity, cycle stage   | App Functionality            |
| **User Content → Photos or Video**| Meal & progress photos                        | App Functionality            |
| **User Content → Other**          | Meal descriptions, check-in answers           | App Functionality            |
| **Identifiers → User ID**         | Clerk account ID                              | App Functionality            |
| **Usage Data → Product Interaction** | Pages viewed / taps (PostHog, Plausible)   | Analytics, App Functionality |

Notes:
- **Payment** is handled entirely by Stripe **on the web** — the app never sees a
  card, so you don't declare financial info here.
- If App Store Connect asks about **Crash/Diagnostics**, you can leave it off
  unless you turn on crash reporting later.

---

## STEP 4 — Listing fields + Review Notes (App Store Connect → your app → the version)

### 4a. Required listing fields
- **Privacy Policy URL:** `https://rivenmethod.com/privacy`
- **Support URL:** `https://rivenmethod.com`
- **Category:** Health & Fitness
- **Price:** Free (subscription is sold on the web; the app is usage-only)
- **Age rating:** complete the questionnaire — RIVEN is 17+/adults (it's for
  adults, per the privacy policy "Children" section).

### 4b. App Review Information → Sign-In required = **Yes**
▼ **Demo Account**
```
Username: appreview@rivenmethod.com
Password: <the exact password you set in Step 1>
```

▼ **Review Notes** (paste this whole block)
```
RIVEN is a weight-loss and body-recomposition COACHING app for adults. It is a
multi-platform service: members subscribe on our website, and this iOS app is
the usage experience. There is no purchase inside the app by design (no IAP), so
please use the demo account above — it has an active membership and opens
straight to the dashboard.

The app's native features (please try these on the demo account):
- Voice meal logging — tap the mic on the "Log" tab to record a meal by voice.
- Camera + photo library — attach a meal photo or a check-in progress photo.
- Daily coaching prompts and progress tracking on the dashboard.
- In-app account deletion is available on the Profile tab ("Delete account").

Sign-in uses email. (Google sign-in is intentionally hidden inside the app
because Google blocks OAuth in web views; email sign-in is the supported path.)

Subscriptions are NOT sold in the app and the app contains no links to external
purchase. Billing is managed entirely on the web via Stripe.

Thank you!
```

---

## STEP 5 — Listing copy (paste into the version's metadata)

▼ **Subtitle** (30 char max)
```
Steady wins. Real coaching.
```

▼ **Promotional Text** (170 char max — editable anytime without re-review)
```
Coaching that meets you where you are. Log meals by voice, track steady progress, and get daily guidance built for real life. Peaceful discipline — steady wins.
```

▼ **Description**
```
RIVEN is a weight-loss and body-recomposition coaching app built on one idea:
peaceful discipline. Steady wins.

No hype, no shame, no diet-culture noise. Just a calm, direct system that helps
you show up, log what you eat, and make steady progress you can actually keep.

WHAT YOU GET
• Voice meal logging — say what you ate and RIVEN estimates the nutrition for you
• Photo logging — snap a meal or a progress photo in seconds
• Daily coaching — short, real-talk guidance that adapts to your day
• Progress tracking — weight, check-ins, and the wins that keep you going
• A private space — your data is yours; never visible to other members

WHO IT'S FOR
RIVEN is built for women 35+ who are done with crash diets and ready for
something steady. Real food, real life, real progress.

MEMBERSHIP
RIVEN membership is managed on our website. Already a member? Just sign in and
go. New here? Visit rivenmethod.com to learn more.

Questions? Email lamper.2019@gmail.com
```

▼ **Keywords** (100 char max, comma-separated, no spaces)
```
weight loss,coaching,meal log,nutrition,macros,protein,women,fitness,health,habit,progress,body
```

> One caution on the description: the line "Visit rivenmethod.com to learn more"
> is about *learning more*, not buying — that's allowed. Do **not** add any
> "subscribe / start trial on the web" language to the listing; that can trip
> Guideline 3.1.1.

---

## STEP 6 — Submit

Attach the TestFlight build to the version → **Add for Review** → **Submit**.
Review is typically 1–3 days. You've pre-empted the usual rejections:
4.2 (real native features + populated demo), 3.1.1 (no in-app purchase or
external-buy links), 4.8 (email sign-in; social login hidden), 5.1.1(v)
(in-app account deletion present).
