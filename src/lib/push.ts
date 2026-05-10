/**
 * Web Push helpers. Server-side only — uses VAPID_PRIVATE_KEY to sign payloads.
 *
 * Browser support: Web Push works in Chrome, Edge, Firefox, and Safari (iOS
 * 16.4+, only when installed via "Add to Home Screen"). The PWA manifest
 * + service worker are already wired up in /public/manifest.json and /public/sw.js.
 */

import webpush, { type PushSubscription as WebPushSubscription, type SendResult } from "web-push";

export const isPushConfigured =
  !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  !!process.env.VAPID_PRIVATE_KEY &&
  !!process.env.VAPID_SUBJECT;

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!isPushConfigured) {
    throw new Error(
      "Web Push is not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in .env.local."
    );
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<SendResult> {
  ensureConfigured();
  const sub: WebPushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
  return webpush.sendNotification(sub, JSON.stringify(payload), {
    TTL: 60 * 60 * 24, // 1 day
  });
}

/**
 * 410 Gone or 404 means the subscription is dead — caller should delete it.
 */
export function isExpiredSubscriptionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { statusCode?: number };
  return e.statusCode === 404 || e.statusCode === 410;
}
