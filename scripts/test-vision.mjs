// Proof: read a silent caption reel by sampling frames + Claude vision.
//   node --env-file=.env --env-file=.env.local scripts/test-vision.mjs
import Anthropic from "@anthropic-ai/sdk";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
const run = promisify(execFile);

const IG = process.env.INSTAGRAM_ACCESS_TOKEN;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 1. pick a recent reel
const media = (await (await fetch(`https://graph.instagram.com/me/media?fields=id,media_type,media_url,caption&limit=12&access_token=${IG}`)).json()).data;
const reel = media.find((m) => m.media_type === "VIDEO");
console.log("Reel:", (reel.caption || "").split("\n")[0].slice(0, 60));

// 2. download mp4
const buf = Buffer.from(await (await fetch(reel.media_url)).arrayBuffer());
await writeFile("/tmp/v.mp4", buf);

// 3. extract 4 frames across the first ~8s
const frames = [];
for (const t of [0.5, 2.5, 4.5, 6.5]) {
  const out = `/tmp/f_${t}.jpg`;
  try {
    await run(ffmpegPath, ["-y", "-ss", String(t), "-i", "/tmp/v.mp4", "-frames:v", "1", "-vf", "scale=540:-1", "-q:v", "4", out]);
    frames.push(out);
  } catch {}
}
console.log(`Extracted ${frames.length} frames`);

// 4. ask Claude to read the screen
const imageBlocks = [];
for (const f of frames) {
  imageBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(f)).toString("base64") } });
}
const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 500,
  messages: [{
    role: "user",
    content: [
      ...imageBlocks,
      { type: "text", text: `These are frames (in order) from an Instagram reel by a weight-loss coach for Black women 35+. Caption: "${reel.caption?.slice(0,200)}". Reply ONLY with JSON: {"hook": "the opening on-screen line", "onScreenText": "all text shown across frames", "visualSummary": "what's physically shown, 1 sentence", "contentType": "story|teaching|result|bts|other", "whyItWorks": "1 sentence, why it does or doesn't grab attention"}` },
    ],
  }],
});
console.log("\n=== Claude read the screen ===\n" + msg.content[0].text);
await rm("/tmp/v.mp4", { force: true });
