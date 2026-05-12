import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { generateMondayCheckin } from "@/lib/monday-checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — gives Claude headroom for N clients

/**
 * Monday-morning Sean check-in.
 *
 * For every CLIENT with a Profile, generate a personalized weekly message
 * via Claude (using last 7 days of logs + chat history) and post it into
 * her thread as a COACH-kind ChatMessage signed by Sean. Also fires a push
 * notification so it arrives like any other Sean touchpoint.
 *
 * Protected by CRON_SECRET. Schedule from Railway:
 *   POST https://rivenmethod.com/api/cron/monday-checkin
 *   Authorization: Bearer $CRON_SECRET
 *   Cron expression: 0 12 * * 1   (Mon 12:00 UTC = 7 AM CDT)
 *
 * Failure isolation: if generation throws for one client, we log + skip
 * her for this week. Other clients still receive theirs. Never insert a
 * broken / half-generated message.
 */
export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set." },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Sean's user row drives senderUserId on the inserted messages. Falls back
  // to null if no COACH user exists yet — UI hardcodes "Sean" for COACH
  // messages anyway, so the message still renders correctly.
  const coach = await prisma.user.findFirst({
    where: { role: "COACH" },
    select: { id: true },
  });

  const clients = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      profile: { isNot: null },
    },
    select: { id: true, email: true },
  });

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ clientId: string; reason: string }> = [];

  // Sequential to avoid hammering the Anthropic API and to keep Railway's
  // single-container memory predictable. With small client counts, total
  // wall time stays well under the 5 min route timeout.
  for (const client of clients) {
    try {
      const result = await generateMondayCheckin({ clientUserId: client.id });
      if (!result.ok) {
        skipped++;
        errors.push({ clientId: client.id, reason: result.error });
        console.error(
          `[cron/monday-checkin] generation failed for ${client.email}:`,
          result.error
        );
        continue;
      }

      const message = await prisma.chatMessage.create({
        data: {
          userId: client.id,
          role: "ASSISTANT",
          kind: "COACH",
          senderUserId: coach?.id ?? null,
          content: result.message,
        },
        select: { id: true },
      });

      // Push the Monday touchpoint to her phone. Best-effort; if push fails
      // the message is still in her inbox.
      try {
        await sendPushToUser(client.id, {
          title: "Monday from Sean",
          body: preview(result.message, 110),
          url: "/messages",
          tag: `monday-checkin-${message.id}`,
        });
      } catch (pushErr) {
        console.error(
          `[cron/monday-checkin] push failed for ${client.email}:`,
          pushErr
        );
      }

      sent++;
    } catch (err) {
      skipped++;
      const reason = err instanceof Error ? err.message : "unknown";
      errors.push({ clientId: client.id, reason });
      console.error(
        `[cron/monday-checkin] unexpected error for ${client.email}:`,
        err
      );
    }
  }

  // Make sure /messages and /dashboard re-render for any open sessions.
  revalidatePath("/messages");
  revalidatePath("/dashboard");

  return NextResponse.json({
    ok: true,
    clientsTargeted: clients.length,
    sent,
    skipped,
    errors: errors.slice(0, 10), // cap response size
  });
}

function preview(content: string, max: number): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max - 1).trimEnd() + "…";
}
