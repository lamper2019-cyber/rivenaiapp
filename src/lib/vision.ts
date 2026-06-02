/**
 * Vision engine — READS THE SCREEN of a post (on-screen captions + visuals)
 * and returns a structured analysis. Built this way because Sean's content is
 * mostly silent (text on screen, no talking), so audio transcription is
 * useless — we look, we don't listen.
 *
 *   IMAGE  → fetch the media_url, hand the single image to Claude vision.
 *   VIDEO  → download the mp4, sample ~4 frames with bundled ffmpeg-static,
 *            hand the frames (in order) to Claude vision.
 *
 * Proven end-to-end 2026-06-01 (scripts/test-vision.mjs). Runs server-side
 * (cron / enrich), never in the browser.
 */

import { execFile } from "node:child_process";
import { readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

const run = promisify(execFile);
const VISION_MODEL = "claude-sonnet-4-6";

export const isVisionConfigured = isAnthropicConfigured;

export type PostVision = {
  hook: string;
  onScreenText: string;
  visualSummary: string;
  contentType: string; // story | teaching | result | bts | other
  whyItWorks: string;
};

type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
};

/** Download a URL to a Buffer. */
async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Sample frames from a video URL via bundled ffmpeg. Returns JPEG buffers. */
async function sampleVideoFrames(mediaUrl: string, timestamps = [0.5, 2.5, 4.5, 6.5]): Promise<Buffer[]> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found.");
  const dir = await mkdtemp(join(tmpdir(), "riven-vision-"));
  const mp4 = join(dir, "v.mp4");
  try {
    await writeFile(mp4, await fetchBuffer(mediaUrl));
    const frames: Buffer[] = [];
    for (const t of timestamps) {
      const out = join(dir, `f_${t}.jpg`);
      try {
        await run(ffmpegPath, [
          "-y", "-ss", String(t), "-i", mp4,
          "-frames:v", "1", "-vf", "scale=540:-1", "-q:v", "4", out,
        ]);
        frames.push(await readFile(out));
      } catch {
        // a timestamp past the end of a short clip — skip it
      }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PROMPT = (caption: string) =>
  `These are frames (in order) from an Instagram post by a weight-loss coach (Sean) for Black women 35+. His brand voice is calm, no-hype, culturally grounded ("peaceful discipline, steady wins"). Caption: "${caption.slice(0, 300)}".

Read what's ON SCREEN (the captions/text and the visuals — he often doesn't talk). Reply ONLY with minified JSON, no markdown:
{"hook":"the opening on-screen line, verbatim","onScreenText":"all text shown across the frames, in order","visualSummary":"what's physically shown, 1 sentence","contentType":"story|teaching|result|bts|other","whyItWorks":"1-2 sentences: why this does or doesn't stop the scroll for his audience"}`;

function parseJson(text: string): PostVision {
  // Strip ```json fences if present, then parse.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const o = JSON.parse(cleaned);
  return {
    hook: String(o.hook ?? "").slice(0, 300),
    onScreenText: String(o.onScreenText ?? "").slice(0, 2000),
    visualSummary: String(o.visualSummary ?? "").slice(0, 500),
    contentType: String(o.contentType ?? "other").slice(0, 20),
    whyItWorks: String(o.whyItWorks ?? "").slice(0, 600),
  };
}

/**
 * Analyze one post. `mediaType` is "REELS"/"VIDEO" or "IMAGE"/"CAROUSEL_ALBUM".
 * Throws on hard failures (no media, no API key) — callers catch per-post.
 */
export async function analyzePostVision(post: {
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl?: string | null;
  caption?: string | null;
}): Promise<PostVision> {
  if (!isAnthropicConfigured) throw new Error("ANTHROPIC_API_KEY not set.");

  const isVideo = post.mediaType === "REELS" || post.mediaType === "VIDEO";
  const blocks: ImageBlock[] = [];

  if (isVideo) {
    if (!post.mediaUrl) throw new Error("no media_url for video");
    for (const buf of await sampleVideoFrames(post.mediaUrl)) {
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
    }
  } else {
    const url = post.mediaUrl ?? post.thumbnailUrl;
    if (!url) throw new Error("no image url");
    const buf = await fetchBuffer(url);
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: buf.toString("base64") } });
  }

  if (blocks.length === 0) throw new Error("no frames extracted");

  const client = getAnthropicClient();
  const msg = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 600,
    messages: [{ role: "user", content: [...blocks, { type: "text", text: PROMPT(post.caption ?? "") }] }],
  });
  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  return parseJson(text);
}
