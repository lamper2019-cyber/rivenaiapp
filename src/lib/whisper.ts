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

export async function transcribeAudio(audio: Blob, fileName: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env.local.");
  }

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
    throw new Error(
      `Whisper returned ${response.status}: ${errBody.slice(0, 200) || response.statusText}`
    );
  }

  const data = (await response.json()) as { text?: string };
  if (typeof data.text !== "string" || !data.text.trim()) {
    throw new Error("Whisper returned an empty transcription.");
  }
  return data.text.trim();
}
