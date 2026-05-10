import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import {
  CHAT_MODEL,
  CHAT_PERSONA_PROMPT,
  buildClientContext,
} from "@/lib/chat-prompt";
import type { ChatRole } from "@prisma/client";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Keep messages under 2000 characters")
    .transform((s) => s.trim()),
  imageUrls: z
    .array(z.string().url())
    .max(4, "At most 4 images per message")
    .optional()
    .default([]),
});

const HISTORY_LIMIT = 20;

export async function POST(req: Request) {
  if (!isAnthropicConfigured) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set in .env.local." },
      { status: 503 }
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: isClerkConfigured
          ? "Not signed in."
          : "Add real Clerk keys to .env.local to chat with RIVEN.",
      },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { message, imageUrls } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { profile: true },
  });
  if (!user || !user.profile) {
    return NextResponse.json(
      { error: "Complete onboarding before chatting with RIVEN." },
      { status: 412 }
    );
  }

  // Pull recent history (oldest → newest order for the API). Include image URLs
  // so multi-turn conversations can reference earlier photos.
  const historyDesc = await prisma.chatMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { role: true, content: true, imageUrls: true },
  });
  const history = historyDesc.reverse();

  const today = startOfDay(new Date());
  const todayTotals = await prisma.dailyTotals.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });

  const clientContext = buildClientContext(
    user.profile,
    todayTotals
      ? { calories: todayTotals.totalCalories, protein: todayTotals.totalProtein }
      : null
  );

  // Save the user's message before we kick off the model call so it persists
  // even if streaming fails midway.
  await prisma.chatMessage.create({
    data: {
      userId: user.id,
      role: "USER",
      content: message,
      imageUrls,
    },
  });

  const anthropic = getAnthropicClient();

  const apiMessages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: roleForApi(m.role),
      content: buildMessageContent(m.content, m.imageUrls),
    })),
    {
      role: "user" as const,
      content: buildMessageContent(message, imageUrls),
    },
  ];

  const stream = anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: CHAT_PERSONA_PROMPT },
      { type: "text", text: clientContext, cache_control: { type: "ephemeral" } },
    ],
    messages: apiMessages,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      let clientGone = false;

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            if (!clientGone) {
              try {
                controller.enqueue(encoder.encode(event.delta.text));
              } catch {
                clientGone = true;
              }
            }
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unexpected error from Claude.";
        if (!clientGone) {
          try {
            controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (fullText.trim().length > 0) {
          try {
            await prisma.chatMessage.create({
              data: {
                userId: user.id,
                role: "ASSISTANT",
                content: fullText,
              },
            });
          } catch {
            /* don't crash the stream if the DB write fails */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      /* Anthropic stream will be GC'd; nothing to do. */
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

function roleForApi(role: ChatRole): "user" | "assistant" {
  return role === "USER" ? "user" : "assistant";
}

function buildMessageContent(
  text: string,
  imageUrls: string[]
): string | Anthropic.MessageParam["content"] {
  if (imageUrls.length === 0) return text;
  // Image blocks come first so Claude sees the visual context before the question.
  const blocks: Anthropic.ImageBlockParam[] = imageUrls.map((url) => ({
    type: "image",
    source: { type: "url", url },
  }));
  return [...blocks, { type: "text", text }];
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
