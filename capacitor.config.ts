import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RIVEN iOS/Android native shell (Capacitor).
 *
 * RIVEN is a server-rendered Next.js app, so the native shell LOADS the live
 * site (server.url) inside a native WebView rather than bundling static files.
 * That keeps server actions, Clerk, and Stripe working exactly as on the web.
 *
 * KNOWN WORK before App Store submission (see docs/IOS-BUILD.md):
 *  1. Google sign-in is blocked inside webviews — route auth through the
 *     system browser / add Sign in with Apple + email.
 *  2. No in-app purchase button on iOS — the app is usage-only; members
 *     subscribe on the web. Hide /pricing buy CTAs when running in Capacitor.
 */
const config: CapacitorConfig = {
  appId: "com.rivenmethod.app",
  appName: "RIVEN",
  webDir: "public", // placeholder; we serve the live site via server.url below
  // Tags the WebView's user-agent so the live site can detect "running inside
  // the iOS app" and go usage-only (no Subscribe button — Apple IAP rule).
  // Must stay in sync with the `RIVENApp` check in src/app/(clerk)/pricing/page.tsx.
  appendUserAgent: "RIVENApp",
  server: {
    url: "https://rivenmethod.com",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
