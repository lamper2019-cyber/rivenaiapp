import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isExpiredSubscriptionError, isPushConfigured } from "@/lib/push";
import { startOfIsoWeek } from "@/lib/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sunday-morning reminder push.
 *
 * Sends a push to every CLIENT who hasn't yet submitted this week's check-in.
 * Protected by CRON_SECRET — pass it as `Authorization: Bearer $CRON_SECRET`.
 *
 * To run weekly: schedule a real cron (Vercel Cron, Railway cron, EasyCron,
 * cron-job.org, etc.) to hit:
 *   POST https://yourdomain.com/api/cron/sunday-reminder
 *   Authorization: Bearer $CRON_SECRET
 * Suggested schedule: Sunday 09:00 in Sean's timezone.
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

  const weekStart = startOfIsoWeek(new Date());

  // Clients who haven't checked in for the current week.
  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      profile: { isNot: null },
      weeklyCheckIns: {
        none: { weekStart },
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
          title: "Sunday check-in is open",
          body: "Eight questions, two photos, ten minutes. Tap to start.",
          url: "/check-in",
          tag: `checkin-${weekStart.toISOString().slice(0, 10)}`,
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
    weekStart: weekStart.toISOString(),
    clientsTargeted: clients.length,
    sent,
    failed,
    expiredCleaned: expiredIds.length,
  });
}
