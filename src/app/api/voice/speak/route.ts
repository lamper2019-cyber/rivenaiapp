import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * RIVEN's voice — text-to-speech via ElevenLabs. This is the *expensive* part
 * (~1-2¢ per spoken reply), so it's used only where it lands: the morning
 * brief and tap-to-talk answers. Everything else stays text.
 *
 * Dormant until two env vars are set in Railway:
 *   ELEVENLABS_API_KEY   — the account key
 *   ELEVENLABS_VOICE_ID  — the chosen RIVEN voice (warm, steady)
 * Without them this returns 503 and the UI silently hides the speak button —
 * the text experience is unaffected.
 *
 * Uses the Flash model (eleven_flash_v2_5) — ~half the credit cost per
 * character and low latency, which is what a back-and-forth coach needs.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 600; // a coaching reply is ~500 chars; cap runaway input

/** Lets the UI know whether to show the speak button at all. */
export async function GET() {
  const enabled = !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID;
  return NextResponse.json({ enabled });
}

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: "Voice isn't configured. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID." },
      { status: 503 },
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Cap spend: a member can't hammer TTS. 40 spoken lines/min is plenty.
  const rl = rateLimit(`tts:${userId}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Slow down a sec — try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const text = (body.text ?? "").trim().slice(0, MAX_CHARS);
  if (!text) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_flash_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    );
    if (!r.ok) {
      return NextResponse.json(
        { error: "Voice service hiccup." },
        { status: 502 },
      );
    }
    const audio = await r.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the voice service." }, { status: 502 });
  }
}
