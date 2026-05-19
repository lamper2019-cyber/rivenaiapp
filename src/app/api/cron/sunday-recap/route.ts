import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPush, isExpiredSubscriptionError, isPushConfigured } from "@/lib/push";
import { startOfCentralDay } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sunday-morning weekly recap push.
 *
 * For each active CLIENT (trialing | active | comped, with a profile), sums
 * the past 7 Central days of MealLog data and pushes a personalized recap:
 *
 *   "Last week: 6 of 7 days logged · 1,640 cal avg · 138g protein.
 *    Steady week. Open the app — full recap inside."
 *
 * Schedule (Railway service, image-based, mirrors sunday-reminder):
 *   POST https://rivenmethod.com/api/cron/sunday-recap
 *   Authorization: Bearer $CRON_SECRET
 *   Suggested cron: `30 13 * * 0` UTC (= Sun 8:30 AM CDT, 7:30 AM CST).
 *
 * Quiet weeks (0 days logged) get a different copy variant so we don't
 * congratulate someone for nothing.
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

  if (!isPushConfigured) {
    return NextResponse.json(
      { error: "Web Push is not configured." },
      { status: 503 },
    );
  }

  // Window = the seven Central days ending YESTERDAY (we run Sunday morning
  // covering Mon–Sat). Excluding today keeps "last week" feeling clean.
  const today = startOfCentralDay();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 7);

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      profile: { isNot: null },
      subscriptionStatus: { in: ["trialing", "active", "comped"] },
    },
    select: {
      id: true,
      profile: { select: { cutCalories: true, proteinFloor: true } },
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

  if (clients.length === 0) {
    return NextResponse.json({ ok: true, clientsTargeted: 0, sent: 0 });
  }

  // One bulk query for everyone's logs in the window. Group in memory to
  // avoid N round-trips.
  const clientIds = clients.map((c) => c.id);
  const meals = await prisma.mealLog.findMany({
    where: {
      userId: { in: clientIds },
      createdAt: { gte: weekStart, lt: today },
    },
    select: { userId: true, calories: true, protein: true, createdAt: true },
  });

  const dayKey = (d: Date) =>
    startOfCentralDay(d).toISOString().slice(0, 10);

  const byUser = new Map<
    string,
    { totalCal: number; totalProtein: number; mealCount: number; days: Set<string> }
  >();
  for (const id of clientIds) {
    byUser.set(id, {
      totalCal: 0,
      totalProtein: 0,
      mealCount: 0,
      days: new Set(),
    });
  }
  for (const m of meals) {
    const e = byUser.get(m.userId);
    if (!e) continue;
    e.totalCal += m.calories;
    e.totalProtein += m.protein;
    e.mealCount += 1;
    e.days.add(dayKey(m.createdAt));
  }

  let sent = 0;
  let failed = 0;
  const expiredIds: string[] = [];

  for (const client of clients) {
    const stats = byUser.get(client.id)!;
    const daysLogged = stats.days.size;
    const { title, body } = recapCopy({
      daysLogged,
      totalCal: stats.totalCal,
      totalProtein: stats.totalProtein,
    });

    for (const sub of client.pushSubscriptions) {
      try {
        await sendPush(sub, {
          title,
          body,
          url: "/dashboard",
          tag: `recap-${weekStart.toISOString().slice(0, 10)}`,
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

function recapCopy(input: {
  daysLogged: number;
  totalCal: number;
  totalProtein: number;
}): { title: string; body: string } {
  if (input.daysLogged === 0) {
    return {
      title: "Quiet week — new shot",
      body: "No logs last week. New week, fresh start. Tap to log breakfast.",
    };
  }
  const avgCal = Math.round(input.totalCal / input.daysLogged);
  const avgProtein = Math.round(input.totalProtein / input.daysLogged);
  return {
    title: `Last week: ${input.daysLogged} of 7 days logged`,
    body: `${avgCal.toLocaleString()} cal avg · ${avgProtein}g protein. Open the app for the full recap.`,
  };
}
