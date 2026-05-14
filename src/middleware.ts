import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/(.*)",
  // Stripe webhook is signature-verified, not Clerk-protected.
  "/api/stripe/webhook",
  // Cron endpoints are protected by CRON_SECRET, not Clerk session.
  "/api/cron/(.*)",
  "/manifest.json",
  "/sw.js",
  // Clerk's internal proxy/handshake URLs — must bypass our auth.protect()
  // call so Clerk's middleware can handle them itself. Without this, deployed
  // dev-key apps loop on /clerk_<timestamp> paths and 500 with ECONNRESET.
  "/clerk_(.*)",
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
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
