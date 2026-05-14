import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. Receives event POSTs from Stripe and mirrors
 * subscription state into the User table. Signature-verified via the
 * STRIPE_WEBHOOK_SECRET that Stripe issues when you add the endpoint in
 * their dashboard.
 *
 * Stripe is the source of truth for subscription status; the DB is just
 * a cache so the paywall doesn't have to call the Stripe API on every
 * request. The webhook is what keeps them in sync.
 *
 * Events we care about:
 *   - customer.subscription.created  (trial starts after Checkout)
 *   - customer.subscription.updated  (trialing → active → canceled, etc.)
 *   - customer.subscription.deleted  (sub fully removed)
 *
 * Anything else is ack'd with 200 so Stripe doesn't retry forever.
 */
export async function POST(req: Request) {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json(
      { error: "Stripe not configured." },
      { status: 503 },
    );
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not set." },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // Stripe requires the RAW request body for signature verification. Reading
  // .text() preserves the bytes Stripe signed; .json() would re-serialize
  // and break the signature.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bad signature.";
    console.error("[stripe/webhook] signature verification failed:", msg);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToUser(subscription);
        break;
      }

      default:
        // Acknowledge other events so Stripe doesn't retry them. We could
        // expand this later (e.g. invoice.payment_failed → dunning email)
        // but right now subscription.updated already covers state changes.
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error for", event.type, err);
    // Return 500 so Stripe retries — DB blips shouldn't drop a payment event.
    return NextResponse.json({ error: "Handler failure." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Mirror a Stripe subscription into the matching User row. Looks up the user
 * by their stripeCustomerId, which we set when the Checkout session was
 * created — so by the time we receive a subscription event, the User row
 * already has the customer mapping.
 */
async function syncSubscriptionToUser(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, subscriptionStatus: true },
  });
  if (!user) {
    console.warn(
      `[stripe/webhook] no user found for stripeCustomerId=${customerId}`,
    );
    return;
  }

  // Don't overwrite "comped" — that's our own override for beta clients,
  // distinct from any Stripe state.
  if (user.subscriptionStatus === "comped") return;

  // Newer Stripe API (2026-04-22.dahlia) moved current_period_end onto each
  // subscription item rather than the subscription itself. One-item subs (our
  // case — just the $50/mo Price) take the first item's period end.
  const itemPeriodEnd = subscription.items.data[0]?.current_period_end;
  const periodEnd =
    typeof itemPeriodEnd === "number" ? new Date(itemPeriodEnd * 1000) : null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: periodEnd,
    },
  });
}
