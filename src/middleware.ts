import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  // Lead-gen quiz funnel — all three pages are pre-signup, public by design.
  "/quiz",
  "/quiz/(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  // Stripe webhook is signature-verified, not Clerk-protected.
  "/api/stripe/webhook",
  // Cron endpoints are protected by CRON_SECRET, not Clerk session.
  "/api/cron/(.*)",
  "/manifest.json",
  "/sw.js",
]);

// Dev escape hatch: when CLERK_SECRET_KEY is the placeholder from .env.example,
// skip Clerk entirely so the app boots without real credentials. As soon as a
// real `sk_test_*` secret is pasted in, Clerk middleware kicks in automatically.
const hasRealClerkKeys =
  !!process.env.CLERK_SECRET_KEY &&
  !process.env.CLERK_SECRET_KEY.startsWith("sk_test_dummy") &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes("katydid");

const noopMiddleware = (_req: NextRequest) => {
  void _req;
  return NextResponse.next();
};

const middleware = hasRealClerkKeys
  ? clerkMiddleware((auth, req) => {
      if (!isPublicRoute(req)) {
        auth().protect();
      }
    })
  : noopMiddleware;

export default middleware;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|pdf|mp4|mov|webm|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
