import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DAY_KEYS } from "@/lib/calorie-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/set-calorie-schedule
 *
 * Sets a per-day-of-week calorie schedule on a specific client's Profile.
 * CRON_SECRET-gated (same pattern as /api/admin/comp-clients). Body:
 *
 *   {
 *     "email": "client@example.com",
 *     "schedule": {
 *       "Sun": 1700, "Mon": 1800, "Tue": 1750, "Wed": 1800,
 *       "Thu": 1800, "Fri": 2000, "Sat": 2100
 *     }
 *   }
 *
 * Pass `"schedule": null` (or omit it) to CLEAR the schedule and revert
 * the client back to flat cutCalories.
 *
 * Example call from Sean's laptop:
 *   curl -X POST https://rivenmethod.com/api/admin/set-calorie-schedule \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"rora@example.com","schedule":{"Sun":1700,"Mon":1800,"Tue":1750,"Wed":1800,"Thu":1800,"Fri":2000,"Sat":2100}}'
 */

const ScheduleSchema = z
  .object({
    Sun: z.number().int().min(800).max(5000),
    Mon: z.number().int().min(800).max(5000),
    Tue: z.number().int().min(800).max(5000),
    Wed: z.number().int().min(800).max(5000),
    Thu: z.number().int().min(800).max(5000),
    Fri: z.number().int().min(800).max(5000),
    Sat: z.number().int().min(800).max(5000),
  })
  .strict();

const BodySchema = z.object({
  email: z.string().email(),
  schedule: ScheduleSchema.nullable().optional(),
});

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

  let raw;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { email, schedule } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, profile: { select: { id: true } } },
  });
  if (!user) {
    return NextResponse.json(
      { error: `No user found with email ${email}` },
      { status: 404 },
    );
  }
  if (!user.profile) {
    return NextResponse.json(
      { error: `${email} hasn't completed onboarding (no Profile row yet)` },
      { status: 412 },
    );
  }

  // Re-key the schedule with our canonical DAY_KEYS order so the JSONB
  // column always reads the same way (helps eyeball debugging).
  const normalized =
    schedule === null || schedule === undefined
      ? null
      : Object.fromEntries(DAY_KEYS.map((k) => [k, schedule[k]]));

  await prisma.profile.update({
    where: { id: user.profile.id },
    // Prisma JSON nullability gotcha: passing JS `null` won't clear the
    // column — you need Prisma.DbNull to set the cell to SQL NULL.
    data: {
      dailyCalorieSchedule:
        normalized === null ? Prisma.DbNull : normalized,
    },
  });

  return NextResponse.json({
    ok: true,
    email,
    schedule: normalized,
  });
}
