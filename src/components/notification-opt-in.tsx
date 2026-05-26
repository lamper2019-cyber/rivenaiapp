"use client";

import { useEffect, useState } from "react";

type Status =
  | "loading"
  | "needs-install" // iOS Safari before Add to Home Screen — let PwaInstallBanner own this
  | "unsupported" // desktop browser without push support
  | "denied" // user blocked in browser settings
  | "needs-permission" // permission default, can be requested
  | "subscribed" // we're good — hide
  | "missing-config"; // VAPID keys not configured

/**
 * Dashboard-level reminder to enable push notifications.
 *
 * Renders nothing unless there's an actionable next step. Self-hides once
 * the client has an active push subscription, so we don't nag.
 *
 * iOS Safari (non-PWA) is handled by `<PwaInstallBanner />` — install must
 * happen before push works, so we step out of the way on that branch.
 */
export function NotificationOptIn({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!vapidPublicKey) {
      setStatus("missing-config");
      return;
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      // iOS Safari (not installed) shows up here. Defer to install banner.
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Android/i.test(ua);
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone ===
          true;
      if (isIOS && !standalone) {
        setStatus("needs-install");
      } else {
        setStatus("unsupported");
      }
      return;
    }

    void (async () => {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setStatus("subscribed");
        return;
      }
      const perm = Notification.permission;
      if (perm === "granted") {
        // Permission granted but no subscription — likely cleared the SW. We
        // can resubscribe silently when the user taps the CTA.
        setStatus("needs-permission");
        return;
      }
      if (perm === "denied") {
        setStatus("denied");
        return;
      }
      setStatus("needs-permission");
    })();
  }, [vapidPublicKey]);

  async function subscribe() {
    if (!vapidPublicKey) return;
    setError(null);
    setBusy(true);
    try {
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          if (result === "denied") setStatus("denied");
          throw new Error("Permission denied.");
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(
        vapidPublicKey
      ) as Uint8Array<ArrayBuffer>;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      const subJson = sub.toJSON();
      const resp = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error ?? `Subscribe failed: ${resp.status}`);
      }
      setStatus("subscribed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't turn on notifications";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  // Render nothing for branches the install banner / profile page already cover.
  if (
    status === "loading" ||
    status === "subscribed" ||
    status === "needs-install" ||
    status === "unsupported" ||
    status === "missing-config"
  ) {
    return null;
  }

  if (status === "denied") {
    return (
      <section className="rounded-md bg-surface-container-lowest border border-soft-red/40 shadow-elevation-1 px-gutter py-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-soft-red text-[24px] shrink-0 mt-0.5">
            notifications_off
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              Notifications blocked
            </p>
            <p className="font-body text-body-md text-charcoal mt-1">
              You blocked notifications in your browser. Open Settings →
              Notifications for RIVEN and allow them, then reload this page.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // needs-permission
  return (
    <section className="relative rounded-md bg-gradient-to-br from-secondary-container/40 via-cream to-tertiary-container/20 border border-gold/40 shadow-elevation-1 px-gutter py-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-gold text-[28px] shrink-0">
          notifications_active
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-headline-md text-charcoal">
            Turn on notifications
          </h3>
          <p className="font-body text-body-md text-on-surface-variant mt-1">
            So Sean can reach you — and so you never miss your monthly check-in
            reminder.
          </p>
          <button
            type="button"
            onClick={subscribe}
            disabled={busy}
            className="mt-3 inline-flex items-center gap-2 bg-charcoal text-cream rounded-full px-5 py-2 font-body text-label-md tracking-widest uppercase hover:opacity-90 transition-opacity disabled:opacity-60 active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">
              notifications_active
            </span>
            {busy ? "Turning on…" : "Turn on"}
          </button>
          {error && (
            <p
              role="alert"
              className="font-body text-label-sm text-soft-red mt-2"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
