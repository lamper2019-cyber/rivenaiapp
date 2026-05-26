import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isExpiredSubscriptionError, isPushConfigured } from "@/lib/push";
import { startOfCentralMonth } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Monthly check-in reminder push.
 *
 * Used to be a weekly Sunday push. The check-in cadence moved to monthly
 * (1st of each month), so this route now fires once a month: only on the
 * 1st in Central time. Schedule it to run daily and let the date guard
 * pick its one valid morning per month.
 *
 * Suggested external schedule: daily at 09:00 Central. The route no-ops
 * on every day except the 1st. (We kept the `sunday-reminder` path name
 * so the external cron config doesn't need rewiring — the comment above
 * tells future-you why the path is misleading.)
 *
 * Protected by CRON_SECRET — pass it as `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set in .env.local." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured) {
    return NextResponse.json(
      { error: "Web Push is not configured." },
      { status: 503 }
    );
  }

  // Only fire on day-1 of the Central month. Every other day, no-op.
  const dayOfMonth = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      day: "numeric",
    }).format(new Date()),
    10,
  );
  if (dayOfMonth !== 1) {
    return NextResponse.json({
      ok: true,
      noop: true,
      reason: `Day ${dayOfMonth} — monthly reminder fires only on the 1st.`,
    });
  }

  const monthStart = startOfCentralMonth();

  // Clients who haven't checked in for this month yet.
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      profile: { isNot: null },
      weeklyCheckIns: {
        none: { weekStart: monthStart },
      },
    },
    select: {
      id: true,
      pushSubscriptions: {
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  for (const client of clients) {
    for (const sub of client.pushSubscriptions) {
      try {
        await sendPush(sub, {
          title: "Monthly check-in is open",
          body: "Weight, waist, two photos, ten minutes. Tap to start.",
          url: "/check-in",
          tag: `checkin-${monthStart.toISOString().slice(0, 7)}`,
        });
        sent++;
      } catch (err) {
        failed++;
        if (isExpiredSubscriptionError(err)) {
          expiredIds.push(sub.id);
        }
      }
    }
  }

  // Garbage-collect dead subscriptions.
  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: expiredIds } },
    });
  }

  return NextResponse.json({
    ok: true,
    monthStart: monthStart.toISOString(),
    clientsTargeted: clients.length,
    sent,
    failed,
    expiredCleaned: expiredIds.length,
  });
}
