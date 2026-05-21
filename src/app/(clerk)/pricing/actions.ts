"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  stripe,
  isStripeConfigured,
  PRICE_ID_MONTHLY,
  getAppUrl,
} from "@/lib/stripe";

/**
 * Starts a Stripe Checkout subscription session for the signed-in user and
 * redirects them to the Stripe-hosted payment form. Lazily creates a Stripe
 * Customer if this is the user's first checkout.
 *
 * Trial config (7 days) lives on the subscription_data here — NOT on the
 * Price itself — so we can change trial length later without recreating
 * the Price in Stripe.
 *
 * Callers: the "Start free trial" button on /pricing.
 */
export async function startCheckout() {
  if (!isStripeConfigured || !stripe) {
    throw new Error("Stripe is not configured on this deployment.");
  }
  if (!PRICE_ID_MONTHLY) {
    throw new Error("STRIPE_PRICE_ID_MONTHLY is not set.");
  }

  const { userId } = auth();
  if (!userId) redirect("/sign-up");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!user) {
    // No User row yet — sign-up + onboarding bootstraps it. Send them back
    // through the funnel rather than creating a Stripe customer for an
    // identity we don't have on record yet.
    redirect("/onboarding");
  }

  // Reuse an existing Stripe customer or create one. Customer.email is
  // metadata that Stripe surfaces on the dashboard for support workflows.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const clerkUser = await currentUser();
    const customer = await stripe.customers.create({
      email:
        user.email ??
        clerkUser?.primaryEmailAddress?.emailAddress ??
        undefined,
      metadata: {
        userId: user.id,
        source: "riven",
      },
    });
    customerId = customer.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: PRICE_ID_MONTHLY, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId: user.id },
    },
    allow_promotion_codes: true,
    // Send people back where they came from.
    success_url: `${getAppUrl()}/dashboard?subscribed=1`,
    cancel_url: `${getAppUrl()}/pricing?canceled=1`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }
  redirect(session.url);
}
