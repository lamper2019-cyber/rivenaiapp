"use client";

import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "in-app" | "installed" | "unknown";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "riven-pwa-banner-dismissed-v1";
const FIRST_SEEN_KEY = "riven-pwa-first-seen-at";
/** After this many days uninstalled, the banner stops accepting dismiss
 *  and pins itself to the top of the dashboard. Installing the PWA is
 *  the difference between push notifications working or not on iPhone,
 *  so we escalate gently after a reasonable trial period. */
const ESCALATION_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Welcomes the client to install RIVEN to her home screen the way a real
 * app feels. Detects the platform and shows the right install path:
 *   - iOS Safari: plays the iPhone install video (Safari Share → Add to
 *     Home Screen). Required for web push to work on iPhone.
 *   - Android Chrome: triggers the native install prompt when available;
 *     otherwise plays the Android install video.
 *   - Desktop Chrome/Edge: triggers the address-bar install icon (text
 *     steps; no video for desktop).
 *   - In-app browsers (Google App, Facebook, Instagram, TikTok, generic
 *     WebView): tells her to bounce out to a real browser first.
 *
 * Hides itself when running as an installed PWA (display-mode: standalone).
 *
 * Escalation: dismissable for the first ESCALATION_DAYS. After that, if
 * she's still on a browser (not installed), the banner pins to the top
 * of the dashboard with a stronger CTA and the dismiss button is gone —
 * installing is the one thing that has to happen for the app to work the
 * way it should on iPhone.
 */
export function PwaInstallBanner() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [deferred, setDeferred] = useState<DeferredPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed?
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari pre-iOS 17 doesn't support display-mode: standalone reliably
      // — fall back to navigator.standalone.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setPlatform("installed");
      return;
    }

    const ua = navigator.userAgent;
    const inApp = detectInAppBrowser(ua);
    if (inApp) {
      // In-app browser CAN'T install. Show the bounce-out instructions
      // regardless of prior dismissal — install is impossible from here.
      setPlatform("in-app");
      return;
    }

    // Record the first time she saw this banner, so we know when to escalate.
    let firstSeen: number | null = null;
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(FIRST_SEEN_KEY);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed)) {
        firstSeen = parsed;
      } else {
        firstSeen = Date.now();
        localStorage.setItem(FIRST_SEEN_KEY, String(firstSeen));
      }
    }
    const daysSinceFirstSeen = firstSeen
      ? (Date.now() - firstSeen) / MS_PER_DAY
      : 0;
    const shouldEscalate = daysSinceFirstSeen >= ESCALATION_DAYS;
    setEscalated(shouldEscalate);

    // Respect the dismiss flag until escalation kicks in — once we hit the
    // threshold the banner has to be visible no matter what.
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(DISMISS_KEY) === "1" &&
      !shouldEscalate
    ) {
      setDismissed(true);
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Android/i.test(ua);
    const isAndroid = /Android/i.test(ua);

    if (isIOS) setPlatform("ios");
    else if (isAndroid) setPlatform("android");
    else setPlatform("desktop");

    // Capture beforeinstallprompt for Android/Desktop Chrome.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as DeferredPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    if (escalated) return; // can't dismiss after escalation
    setDismissed(true);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(DISMISS_KEY, "1");
    }
  }

  async function triggerNativePrompt() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      // Hide; the next visit will be in standalone mode anyway.
      setPlatform("installed");
    }
    setDeferred(null);
  }

  if (platform === "installed" || platform === "unknown") return null;
  if (dismissed && platform !== "in-app") return null;

  if (platform === "in-app") return <InAppBrowserBanner />;

  // Native prompt ready → take over the banner with a big, single-purpose
  // CTA. No video distraction needed.
  if (deferred && (platform === "android" || platform === "desktop")) {
    return (
      <InflatedInstallBanner
        platform={platform}
        onInstall={triggerNativePrompt}
        onDismiss={dismiss}
        escalated={escalated}
      />
    );
  }

  return (
    <VideoInstallBanner
      platform={platform}
      escalated={escalated}
      onDismiss={dismiss}
    />
  );
}

// ─────────────────────── platform detection ───────────────────────

/**
 * Detect embedded browsers that can't install PWAs. Order matters — check
 * the most specific tokens first so Facebook's UA (which contains "Chrome")
 * doesn't get classed as Chrome.
 */
function detectInAppBrowser(ua: string): boolean {
  // Facebook / Instagram / Messenger
  if (/FBAN|FBAV|FB_IAB|FB4A|Instagram|Messenger/i.test(ua)) return true;
  // Google App (iOS + Android) — GSA on iOS, search-app webview on Android
  if (/GSA\/|googleapp|GoogleApp/i.test(ua)) return true;
  // TikTok / Snapchat / LinkedIn / Pinterest / Twitter
  if (/(TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest|Twitter)/i.test(ua)) return true;
  // Generic Android WebView — UA contains "; wv)" specifically
  if (/Android.*; wv\)/i.test(ua)) return true;
  return false;
}

// ─────────────────────── banner variants ───────────────────────

function VideoInstallBanner({
  platform,
  escalated,
  onDismiss,
}: {
  platform: "ios" | "android" | "desktop";
  escalated: boolean;
  onDismiss: () => void;
}) {
  // Video is only available for the two phone paths RIVEN recorded.
  // Desktop falls through to text steps.
  const videoSrc =
    platform === "ios"
      ? "/videos/install-iphone.mp4"
      : platform === "android"
      ? "/videos/install-android.mp4"
      : null;

  const titleByPlatform: Record<"ios" | "android" | "desktop", string> = {
    ios: "Install RIVEN on your iPhone",
    android: "Install RIVEN on your phone",
    desktop: "Install RIVEN on your computer",
  };

  // When escalated, pin to the top of the dashboard so the install task
  // doesn't get scrolled past. The dashboard is the standard scroll
  // surface, so position:sticky + top-0 keeps the banner glued there.
  const wrapperClass = escalated
    ? "sticky top-0 z-30 rounded-md bg-gradient-to-br from-gold/30 via-cream to-secondary-container/40 border border-gold shadow-elevation-2 px-gutter py-4"
    : "relative rounded-md bg-gradient-to-br from-secondary-container/40 via-cream to-tertiary-container/20 border border-gold/40 shadow-elevation-1 px-gutter py-4";

  return (
    <section className={wrapperClass} aria-labelledby="pwa-banner-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <span className="material-symbols-outlined text-gold text-[28px] shrink-0">
            install_mobile
          </span>
          <div className="flex-1 min-w-0">
            <h3
              id="pwa-banner-title"
              className="font-display text-headline-md text-charcoal"
            >
              {titleByPlatform[platform]}
            </h3>
            <p className="font-body text-body-md text-on-surface-variant mt-1">
              {escalated
                ? "This step has to happen for the app to work the way it should — push reminders only work after you install."
                : "Get a real app icon on your home screen. Needed for Sunday push reminders on iPhone."}
            </p>
          </div>
        </div>
        {!escalated && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss install banner"
            className="shrink-0 text-on-surface-variant/60 hover:text-charcoal transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        )}
      </div>

      {videoSrc ? (
        <div className="mt-4">
          <p className="font-body text-label-md tracking-widest uppercase text-charcoal mb-2">
            Watch the video to install
          </p>
          {/* preload="metadata" so the video tag only fetches the first
              few KB until she hits play — important for the iPhone clip
              which is ~12 MB. playsInline is REQUIRED on iOS Safari or
              video will go fullscreen on play. */}
          <video
            src={videoSrc}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md bg-charcoal/5 border border-outline-variant/40"
          />
        </div>
      ) : (
        // Desktop fallback — keeps the existing text steps.
        <div className="mt-4 pt-4 border-t border-outline-variant/40">
          <DesktopInstructions />
        </div>
      )}
    </section>
  );
}

function InAppBrowserBanner() {
  // Different copy based on whether we can guess the OS — the menu glyph and
  // wording differs between iOS and Android.
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Android/i.test(ua);

  return (
    <section
      className="relative rounded-md bg-soft-red/10 border border-soft-red/40 shadow-elevation-1 px-gutter py-4"
      aria-labelledby="pwa-banner-title"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-soft-red text-[28px] shrink-0">
          open_in_new
        </span>
        <div className="flex-1 min-w-0">
          <h3
            id="pwa-banner-title"
            className="font-display text-headline-md text-charcoal"
          >
            Open RIVEN in your real browser
          </h3>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            You&apos;re inside an in-app browser (Google, Facebook, Instagram…). It
            can&apos;t install apps or send push notifications. One quick step gets
            you out:
          </p>
          <ol className="mt-3 space-y-2">
            <li className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
                1
              </span>
              <span className="font-body text-body-md text-charcoal leading-relaxed">
                Tap the <strong>⋯</strong> (or <strong>⋮</strong>) menu near the top of
                this view.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
                2
              </span>
              <span className="font-body text-body-md text-charcoal leading-relaxed">
                {isIOS ? (
                  <>
                    Tap <strong>Open in Safari</strong>.
                  </>
                ) : (
                  <>
                    Tap <strong>Open in Chrome</strong> (or <strong>Open in browser</strong>).
                  </>
                )}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
                3
              </span>
              <span className="font-body text-body-md text-charcoal leading-relaxed">
                Come back here and the install button will work.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function InflatedInstallBanner({
  platform,
  onInstall,
  onDismiss,
  escalated,
}: {
  platform: "android" | "desktop";
  onInstall: () => void;
  onDismiss: () => void;
  escalated: boolean;
}) {
  const headline =
    platform === "android" ? "Install RIVEN on your phone" : "Install RIVEN on your computer";

  const wrapperClass = escalated
    ? "sticky top-0 z-30 rounded-md bg-gradient-to-br from-gold/40 via-cream to-secondary-container/40 border border-gold shadow-elevation-2 px-gutter py-5"
    : "relative rounded-md bg-gradient-to-br from-gold/30 via-cream to-secondary-container/40 border border-gold shadow-elevation-2 px-gutter py-5";

  return (
    <section className={wrapperClass} aria-labelledby="pwa-banner-title">
      {!escalated && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss install banner"
          className="absolute top-3 right-3 text-on-surface-variant/60 hover:text-charcoal transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      )}
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-gold text-[32px] shrink-0">
          install_mobile
        </span>
        <div className="flex-1 min-w-0">
          <h3
            id="pwa-banner-title"
            className="font-display text-headline-md text-charcoal"
          >
            {headline}
          </h3>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            One tap — real app icon, faster opens, push reminders.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onInstall}
        className="mt-4 w-full bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-2 active:scale-[0.98] hover:opacity-90 transition-all"
      >
        Install now
      </button>
    </section>
  );
}

// ─────────────────────── text fallbacks (desktop only) ───────────────────────

function DesktopInstructions() {
  return (
    <ol className="space-y-2">
      <li className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
          1
        </span>
        <span className="font-body text-body-md text-charcoal leading-relaxed">
          Look for the <strong>install icon</strong> in Chrome or Edge&apos;s
          address bar — a small monitor or downward-arrow icon on the right.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
          2
        </span>
        <span className="font-body text-body-md text-charcoal leading-relaxed">
          If you don&apos;t see it, click the three-dot menu and choose{" "}
          <strong>Install RIVEN…</strong>
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
          3
        </span>
        <span className="font-body text-body-md text-charcoal leading-relaxed">
          Click <strong>Install</strong>.
        </span>
      </li>
    </ol>
  );
}
