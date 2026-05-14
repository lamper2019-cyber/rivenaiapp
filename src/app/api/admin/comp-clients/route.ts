import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot admin endpoint to mark a list of clients as "comped" — bypasses
 * the paywall for life. Used for the original beta clients who helped
 * build RIVEN; they never paid retail, never will.
 *
 * Protected by the same CRON_SECRET the scheduled jobs use (it's already in
 * Railway env; no new secret to manage). NOT exposed via UI — call it once
 * from your terminal:
 *
 *   curl -X POST https://rivenmethod.com/api/admin/comp-clients \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"emails": ["client1@gmail.com", "client2@gmail.com"]}'
 *
 * Returns the list of updated users so you can confirm everyone got
 * marked. Idempotent — running it twice just re-sets the same flag.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { emails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !Array.isArray(body.emails) ||
    !body.emails.every((e): e is string => typeof e === "string")
  ) {
    return NextResponse.json(
      { error: "Body must be { emails: string[] }." },
      { status: 400 },
    );
  }

  const emails = body.emails.map((e) => e.toLowerCase().trim());

  const result = await prisma.user.updateMany({
    where: {
      email: { in: emails },
      role: "CLIENT",
    },
    data: {
      subscriptionStatus: "comped",
    },
  });

  // Look up which emails were actually matched so the caller can see who got
  // missed (typo, didn't sign up yet, etc.).
  const matched = await prisma.user.findMany({
    where: {
      email: { in: emails },
      role: "CLIENT",
    },
    select: { id: true, email: true, subscriptionStatus: true },
  });

  const matchedEmails = new Set(matched.map((u) => u.email));
  const missed = emails.filter((e) => !matchedEmails.has(e));

  return NextResponse.json({
    ok: true,
    updated: result.count,
    comped: matched,
    notFound: missed,
  });
}
