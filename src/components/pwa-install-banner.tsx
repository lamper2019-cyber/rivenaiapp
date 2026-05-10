"use client";

import { useEffect, useState } from "react";

type Platform = "ios" | "android" | "desktop" | "installed" | "unknown";

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
 *
 * Hides itself when running as an installed PWA (display-mode: standalone).
 * Dismissable — won't nag again unless the user clears localStorage.
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

    if (typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }

    const ua = navigator.userAgent;
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

  if (platform === "installed" || platform === "unknown" || dismissed) return null;

  const titleByPlatform: Record<Exclude<Platform, "installed" | "unknown">, string> = {
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
              {titleByPlatform[platform as Exclude<Platform, "installed" | "unknown">]}
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
        {platform === "android" && deferred ? (
          <button
            type="button"
            onClick={triggerNativePrompt}
            className="bg-charcoal text-cream rounded-full px-5 py-2 font-body text-label-md tracking-widest uppercase hover:opacity-90 transition-opacity"
          >
            Install now
          </button>
        ) : null}
        {platform === "desktop" && deferred ? (
          <button
            type="button"
            onClick={triggerNativePrompt}
            className="bg-charcoal text-cream rounded-full px-5 py-2 font-body text-label-md tracking-widest uppercase hover:opacity-90 transition-opacity"
          >
            Install RIVEN
          </button>
        ) : null}
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
          {platform === "android" && <AndroidInstructions hasNativePrompt={!!deferred} />}
          {platform === "desktop" && <DesktopInstructions hasNativePrompt={!!deferred} />}
        </div>
      )}
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
