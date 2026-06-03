# RIVEN → App Store (iOS) — build runbook

RIVEN is a server-rendered Next.js app. The iOS app is a **Capacitor native
shell** that loads the live site (`rivenmethod.com`) in a native WebView, so
all server logic/Clerk/Stripe keep working. This doc is the step-by-step.

Status: Apple Developer account ✅ approved. Capacitor config scaffolded
(`capacitor.config.ts`, deps in package.json). Next steps run on Sean's Mac.

---

## 0. One-time Mac prerequisites
- **Xcode** — install from the Mac App Store (large, ~1hr). Open it once, accept the license.
- **CocoaPods** — in Terminal: `sudo gem install cocoapods`
- Make sure you're on the `feat/ios-shell` branch: `git checkout feat/ios-shell`

## 1. Generate the iOS project (run in `riven-app/`)
```bash
npm install                 # pulls the Capacitor dev deps
npx cap add ios             # creates the ios/ Xcode project (Mac only)
npx cap sync ios            # wires the config in
npx cap open ios            # opens the project in Xcode
```

## 2. Sign it (in Xcode)
- Click the **App** target → **Signing & Capabilities**.
- **Team** → select your Apple Developer account (sign in if prompted).
- **Bundle Identifier** → `com.rivenmethod.app`.
- Leave **Automatically manage signing** ON. Xcode creates the cert/profile.

## 3. App identity (in Xcode)
- **Display Name**: RIVEN
- **Version**: 1.0 · **Build**: 1
- **App Icon**: open `Assets.xcassets → AppIcon`, drag in a **1024×1024 PNG**
  (use the RIVEN logo — cream bg, charcoal mark; no transparency for the store icon).

## 4. First run — TEST SIGN-IN (the make-or-break)
- Pick a Simulator (or plug in your iPhone) → press **▶ Run**.
- The app should open and load RIVEN.
- **Try to sign in.** ⚠️ Google login will likely FAIL here — Google blocks
  OAuth inside webviews (`disallowed_useragent`). If it does:
  → tell Claude. We then add **Sign in with Apple** + **email sign-in** for iOS
    (webview-safe) and route Google through the system browser. This is the
    main code task before launch.

## 5. Before you can SUBMIT (two required changes — Claude does these)
1. **Sign in with Apple** — Apple requires it once any social login (Google) is
   offered. Add the capability in Xcode + wire Clerk.
2. **No purchase on iOS** — Apple forces their 30% IAP for in-app digital subs.
   So the iOS app must be **usage-only**: hide the `/pricing` "Subscribe / Start
   trial" buttons when running inside Capacitor; members subscribe on the web.
   (Detect Capacitor at runtime → hide buy CTAs.)

## 6. Ship to TestFlight (internal testing first)
- In Xcode: top device dropdown → **Any iOS Device (arm64)**.
- **Product → Archive**. When it finishes: **Distribute App → App Store Connect
  → Upload**.
- It appears in **App Store Connect → TestFlight** in ~15 min. Install via the
  TestFlight app on your phone and test for real.

## 7. App Store Connect listing (appstoreconnect.apple.com)
- **My Apps → +** → New App → Platform iOS, Bundle ID `com.rivenmethod.app`,
  name **RIVEN**, primary language English, SKU `riven-app`.
- Fill: subtitle, description, keywords, support URL (`rivenmethod.com`),
  **Privacy Policy URL** (REQUIRED — we need `rivenmethod.com/privacy`; Claude
  can generate the page), category **Health & Fitness**.
- **Screenshots**: 6.7" (iPhone 15 Pro Max) + 6.5". Take them in the Simulator.
- **App Privacy** questionnaire: declare what you collect (email, usage, health-
  adjacent inputs). Be honest; it's just disclosure.
- Set price **Free** (the app is free; subscription is sold on the web).

## 8. Submit for review
- Attach the TestFlight build → **Submit for Review**.
- Review takes ~1–3 days. Common rejections we've pre-empted: 4.2 (too thin —
  our app has real logging/coaching), 3.1.1 (IAP — handled by usage-only design),
  4.8 (Sign in with Apple — added).

---

## Open items for Claude to build (in code, this branch)
- [ ] iOS auth: Sign in with Apple + email; Google via system browser
- [ ] Hide `/pricing` purchase CTAs when `Capacitor.isNativePlatform()`
- [ ] `/privacy` page (privacy policy) — required for the listing
- [ ] Native push (later — replaces web push for a better iOS experience)

## Notes
- The shell loads the LIVE site, so every web deploy updates the app instantly —
  no resubmission for content/logic changes (only for native shell changes).
- Android later: same Capacitor project, `npx cap add android` → Google Play
  ($25 one-time, more lenient). Do iOS first per Sean's call.
