import Stripe from "stripe";

/**
 * Stripe SDK client. Initialized lazily — null if STRIPE_SECRET_KEY is not
 * configured so the app can boot in dev without billing wired up. Call sites
 * should branch on `isStripeConfigured` before using `stripe!`.
 *
 * Pin the apiVersion so Stripe doesn't ship a breaking change underneath us
 * mid-day. Bump intentionally when we test against a new version.
 */
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    })
  : null;

export const isStripeConfigured = !!process.env.STRIPE_SECRET_KEY;

/**
 * Subscription statuses that grant the user access to the (app) routes.
 * "comped" is our own value (not from Stripe) for beta clients who get the
 * app gratis for life — bypass the paywall entirely.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "comped",
]);

export function hasActiveSubscription(
  status: string | null | undefined,
): boolean {
  return !!status && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * Single canonical base URL for redirects (Checkout success/cancel,
 * Customer Portal return). Reads NEXT_PUBLIC_APP_URL when set, otherwise
 * falls back to the production domain so previews don't accidentally
 * redirect to localhost.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://rivenmethod.com";
}

export const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY ?? "";
