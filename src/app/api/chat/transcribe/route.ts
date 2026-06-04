import { NextResponse } from "next/server";
import { auth, isClerkConfigured } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isWhisperConfigured, transcribeAudio } from "@/lib/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/m4a",
  "audio/x-m4a",
]);

const MAX_BYTES = 25 * 1024 * 1024; // Whisper's hard cap is 25 MB.

export async function POST(req: Request) {
  if (!isWhisperConfigured) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set in .env.local. Voice messages need it." },
      { status: 503 }
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: isClerkConfigured
          ? "Not signed in."
          : "Add real Clerk keys to .env.local to use voice messages.",
      },
      { status: 401 }
    );
  }

  // Whisper calls cost money per request — cap per-user throughput so a stuck
  // recorder loop or abuse can't run up an OpenAI bill. 20/min is well above
  // any real voice-logging pace.
  const rl = rateLimit(`transcribe:${userId}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Slow down a moment — try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form body." }, { status: 400 });
  }

  const file = formData.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'audio' field." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Audio too large. Whisper limit is ${MAX_BYTES / (1024 * 1024)} MB.` },
      { status: 413 }
    );
  }

  // MediaRecorder commonly produces webm/opus on Chrome, mp4 on Safari.
  // Strip codec parameters before allowlist lookup — iOS Safari sends
  // "audio/mp4;codecs=mp4a.40.2" which our previous code silently fell
  // back to "audio/webm" for, then handed Whisper an mp4 byte stream
  // labeled webm. Whisper rejected those and we returned a generic 502.
  const declaredType = (file as Blob).type;
  const baseType = declaredType.split(";")[0].trim().toLowerCase();
  const mime = ALLOWED_MIME.has(baseType) ? baseType : "audio/webm";

  // Reconstruct as a Blob with the right type so Whisper extension-detection works.
  const buffer = Buffer.from(await file.arrayBuffer());
  const wrapped = new Blob([buffer], { type: mime });
  const fileName = `voice-memo${extensionFor(mime)}`;

  try {
    const text = await transcribeAudio(wrapped, fileName);
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transcription failed.";
    // Log to server console so the actual upstream Whisper error surfaces
    // in Railway logs — a bare 502 in the client is opaque otherwise.
    console.error(
      `[transcribe] failed for user ${userId}, declared=${declaredType}, resolved=${mime}:`,
      msg,
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function extensionFor(mime: string): string {
  switch (mime) {
    case "audio/webm":
      return ".webm";
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    default:
      return "";
  }
}
