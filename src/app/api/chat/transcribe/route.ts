import { NextResponse } from "next/server";
import { auth, isClerkConfigured } from "@/lib/auth";
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
  // Accept anything in the allowlist; default to webm if the browser left it blank.
  const declaredType = (file as Blob).type;
  const mime = ALLOWED_MIME.has(declaredType) ? declaredType : "audio/webm";

  // Reconstruct as a Blob with the right type so Whisper extension-detection works.
  const buffer = Buffer.from(await file.arrayBuffer());
  const wrapped = new Blob([buffer], { type: mime });
  const fileName = `voice-memo${extensionFor(mime)}`;

  try {
    const text = await transcribeAudio(wrapped, fileName);
    return NextResponse.json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transcription failed.";
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
