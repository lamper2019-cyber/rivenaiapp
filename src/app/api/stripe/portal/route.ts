import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, isStripeConfigured, getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe Customer Portal — Stripe-hosted page where the client can change
 * her card, view invoices, or cancel her subscription. Triggered from the
 * "Manage billing" button on /profile.
 *
 * Two-step pattern: this route creates a one-time Portal session for the
 * authenticated user, then redirects them to the Stripe-hosted URL. The
 * portal expires automatically; nothing to clean up on our side.
 */
export async function POST() {
  if (!isStripeConfigured || !stripe) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 503 },
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    // No Stripe customer means this user never went through Checkout — they
    // shouldn't have a "Manage billing" button surfaced. Defensive 400.
    return NextResponse.json(
      { error: "No Stripe customer on record." },
      { status: 400 },
    );
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${getAppUrl()}/profile`,
  });

  return NextResponse.redirect(session.url, { status: 303 });
}
