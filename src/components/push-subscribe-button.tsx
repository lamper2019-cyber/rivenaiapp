"use client";

import { useEffect, useState } from "react";

type PermState = "unsupported" | "default" | "granted" | "denied" | "unknown";

export function PushSubscribeButton({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [perm, setPerm] = useState<PermState>("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as PermState);

    // Check if there's already a subscription on the active SW.
    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  if (!vapidPublicKey) {
    return (
      <DisabledNote>
        Notifications need <code>VAPID_PRIVATE_KEY</code> +{" "}
        <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> in <code>.env.local</code>.
      </DisabledNote>
    );
  }

  if (perm === "unsupported") {
    return (
      <DisabledNote>
        This browser doesn&apos;t support push notifications. On iOS, install RIVEN
        to your home screen first (Share → Add to Home Screen).
      </DisabledNote>
    );
  }

  if (perm === "denied") {
    return (
      <DisabledNote>
        Notifications are blocked in your browser settings. Allow them and reload.
      </DisabledNote>
    );
  }

  async function subscribe() {
    setError(null);
    setBusy(true);
    try {
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        setPerm(result as PermState);
        if (result !== "granted") {
          throw new Error("Permission denied.");
        }
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
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
      setSubscribed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Subscribe failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setError(null);
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unsubscribe failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        className={`block w-full text-center py-4 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 disabled:opacity-60 ${
          subscribed
            ? "bg-surface-container-lowest border border-outline-variant text-charcoal hover:border-gold"
            : "bg-charcoal text-cream shadow-elevation-1 hover:opacity-90"
        }`}
      >
        {busy
          ? "Working…"
          : subscribed
          ? "Notifications on · tap to disable"
          : "Turn on Sunday reminders"}
      </button>
      {error && <p className="font-body text-label-sm text-soft-red">{error}</p>}
      <p className="font-body text-label-sm text-on-surface-variant/70">
        We&apos;ll ping your phone every Sunday morning when the check-in opens.
        Nothing else.
      </p>
    </div>
  );
}

function DisabledNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-surface-container-lowest border border-outline-variant/60 px-gutter py-3 font-body text-body-md text-on-surface-variant">
      {children}
    </div>
  );
}

/**
 * VAPID public keys are URL-safe base64 strings; the Push API needs them as
 * a Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}
