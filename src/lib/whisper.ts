/**
 * OpenAI Whisper transcription wrapper. We talk to Whisper directly via fetch
 * to avoid pulling in the `openai` package — it's a single multipart POST.
 *
 * Set OPENAI_API_KEY in .env.local. Get a key from platform.openai.com →
 * API Keys.
 */

export const isWhisperConfigured = !!process.env.OPENAI_API_KEY;

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
// gpt-4o-mini-transcribe: ~half the price of whisper-1 ($0.003/min vs $0.006/min)
// with comparable or better quality. Same OpenAI account, same endpoint.
const WHISPER_MODEL = "gpt-4o-mini-transcribe";

/**
 * Thrown when the audio reached Whisper fine but contained no recognizable
 * words (silent mic, too-short tap, muffled PWA recording). Callers should
 * surface this as a "didn't catch that — try again," not a server error:
 * production logs show this is by far the most common transcribe failure.
 */
export class EmptyTranscriptionError extends Error {
  constructor() {
    super("No words detected in the recording.");
    this.name = "EmptyTranscriptionError";
  }
}

export async function transcribeAudio(audio: Blob, fileName: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env.local.");
  }

  // One retry on transient upstream trouble (5xx / 429) — a single retry
  // clears most blips without meaningfully delaying the user.
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    form.append("file", audio, fileName);
    form.append("model", WHISPER_MODEL);
    // Bias toward English; Whisper auto-detects but a hint shaves latency.
    form.append("language", "en");

    const response = await fetch(WHISPER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      lastError = new Error(
        `Whisper returned ${response.status}: ${errBody.slice(0, 200) || response.statusText}`
      );
      const transient = response.status >= 500 || response.status === 429;
      if (transient && attempt === 0) continue;
      throw lastError;
    }

    const data = (await response.json()) as { text?: string };
    if (typeof data.text !== "string" || !data.text.trim()) {
      // Not a server problem — the recording had nothing to hear.
      throw new EmptyTranscriptionError();
    }
    return data.text.trim();
  }
  throw lastError ?? new Error("Transcription failed.");
}
