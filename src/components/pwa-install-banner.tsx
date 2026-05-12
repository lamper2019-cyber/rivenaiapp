"use client";

import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "in-app" | "installed" | "unknown";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "riven-pwa-banner-dismissed-v1";

/**
 * Welcomes the client to "install" RIVEN to their home screen the way a real
 * app feels. Detects the platform and shows the right instructions:
 *   - iOS Safari: walks her through Share → Add to Home Screen (required for
 *     web push to work on iPhone).
 *   - Android Chrome: triggers the native install prompt when available;
 *     otherwise points at the browser menu.
 *   - Desktop Chrome/Edge: triggers the address-bar install icon.
 *   - In-app browsers (Google App, Facebook, Instagram, TikTok, generic
 *     WebView): tells her to bounce out to a real browser first.
 *
 * Hides itself when running as an installed PWA (display-mode: standalone).
 * Dismissable — won't nag again unless the user clears localStorage. The
 * in-app variant is NOT dismissable since install is literally impossible
 * until she leaves the embedded browser.
 */
export function PwaInstallBanner() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

    if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") {
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
  // CTA. No "Show me how" distraction.
  if (deferred && (platform === "android" || platform === "desktop")) {
    return (
      <InflatedInstallBanner
        platform={platform}
        onInstall={triggerNativePrompt}
        onDismiss={dismiss}
      />
    );
  }

  const titleByPlatform: Record<"ios" | "android" | "desktop", string> = {
    ios: "Install RIVEN on your iPhone",
    android: "Install RIVEN on your phone",
    desktop: "Install RIVEN on your computer",
  };

  return (
    <section
      className="relative rounded-md bg-gradient-to-br from-secondary-container/40 via-cream to-tertiary-container/20 border border-gold/40 shadow-elevation-1 px-gutter py-4"
      aria-labelledby="pwa-banner-title"
    >
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
              Get a real app icon on your home screen. Needed for Sunday push
              reminders on iPhone.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 text-on-surface-variant/60 hover:text-charcoal transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-body text-label-md tracking-widest uppercase text-charcoal underline underline-offset-4 hover:opacity-80"
        >
          {expanded ? "Hide steps" : "Show me how"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-outline-variant/40 space-y-3">
          {platform === "ios" && <IosInstructions />}
          {platform === "android" && <AndroidInstructions hasNativePrompt={false} />}
          {platform === "desktop" && <DesktopInstructions hasNativePrompt={false} />}
        </div>
      )}
    </section>
  );
}

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
}: {
  platform: "android" | "desktop";
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const headline =
    platform === "android" ? "Install RIVEN on your phone" : "Install RIVEN on your computer";
  return (
    <section
      className="relative rounded-md bg-gradient-to-br from-gold/30 via-cream to-secondary-container/40 border border-gold shadow-elevation-2 px-gutter py-5"
      aria-labelledby="pwa-banner-title"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss install banner"
        className="absolute top-3 right-3 text-on-surface-variant/60 hover:text-charcoal transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
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

function StepList({ items }: { items: { num: string; text: React.ReactNode }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((s) => (
        <li key={s.num} className="flex items-start gap-3">
          <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-charcoal text-cream font-body text-label-sm">
            {s.num}
          </span>
          <span className="font-body text-body-md text-charcoal leading-relaxed">
            {s.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

function IosInstructions() {
  return (
    <>
      <StepList
        items={[
          { num: "1", text: <>Make sure you&apos;re in <strong>Safari</strong> (not Chrome or in-app browser).</> },
          {
            num: "2",
            text: (
              <>
                Tap the <strong>Share</strong> button at the bottom of Safari — the square
                with an arrow pointing up.
              </>
            ),
          },
          {
            num: "3",
            text: (
              <>
                Scroll the menu and tap <strong>Add to Home Screen</strong>.
              </>
            ),
          },
          { num: "4", text: <>Tap <strong>Add</strong> in the top right.</> },
          {
            num: "5",
            text: (
              <>
                Close Safari and open the new <strong>RIVEN</strong> icon from your home
                screen. From now on, open the app from there.
              </>
            ),
          },
        ]}
      />
      <p className="font-body text-label-sm text-on-surface-variant/80 mt-3 italic">
        iPhone only lets installed apps send push notifications. This is the one-time setup
        that unlocks Sunday reminders.
      </p>
    </>
  );
}

function AndroidInstructions({ hasNativePrompt }: { hasNativePrompt: boolean }) {
  return (
    <>
      {hasNativePrompt ? (
        <p className="font-body text-body-md text-charcoal">
          Tap <strong>Install now</strong> above and approve the prompt.
        </p>
      ) : (
        <StepList
          items={[
            { num: "1", text: <>In <strong>Chrome</strong>, tap the three-dot menu (top right).</> },
            { num: "2", text: <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</> },
            { num: "3", text: <>Tap <strong>Install</strong>.</> },
            {
              num: "4",
              text: (
                <>
                  Open the new <strong>RIVEN</strong> icon from your home screen / app drawer.
                </>
              ),
            },
          ]}
        />
      )}
    </>
  );
}

function DesktopInstructions({ hasNativePrompt }: { hasNativePrompt: boolean }) {
  return (
    <>
      {hasNativePrompt ? (
        <p className="font-body text-body-md text-charcoal">
          Tap <strong>Install RIVEN</strong> above to add a desktop app icon.
        </p>
      ) : (
        <StepList
          items={[
            {
              num: "1",
              text: (
                <>
                  Look for the <strong>install icon</strong> in Chrome or Edge&apos;s address
                  bar — a small monitor or downward-arrow icon on the right.
                </>
              ),
            },
            {
              num: "2",
              text: (
                <>
                  If you don&apos;t see it, click the three-dot menu and choose{" "}
                  <strong>Install RIVEN…</strong>
                </>
              ),
            },
            { num: "3", text: <>Click <strong>Install</strong>.</> },
          ]}
        />
      )}
    </>
  );
}
