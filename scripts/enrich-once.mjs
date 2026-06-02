// One-off: run the vision engine over unanalyzed posts + store results.
// Mirrors lib/vision.ts + lib/post-enrich.ts, standalone.
//   ANTHROPIC_API_KEY=... node --env-file=.env scripts/enrich-once.mjs [limit]
import { PrismaClient } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
const run = promisify(execFile);
const prisma = new PrismaClient();
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LIMIT = Number(process.argv[2] || 8);

async function buf(url) { const r = await fetch(url); if (!r.ok) throw new Error(`fetch ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function frames(url) {
  const dir = await mkdtemp(join(tmpdir(), "enr-")); const mp4 = join(dir, "v.mp4");
  try {
    await writeFile(mp4, await buf(url)); const out = [];
    for (const t of [0.5, 2.5, 4.5, 6.5]) {
      const f = join(dir, `${t}.jpg`);
      try { await run(ffmpegPath, ["-y","-ss",String(t),"-i",mp4,"-frames:v","1","-vf","scale=540:-1","-q:v","4",f]); out.push(await readFile(f)); } catch {}
    }
    return out;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const prompt = (c) => `These are frames (in order) from an Instagram post by a weight-loss coach (Sean) for Black women 35+ (brand: calm, no-hype, "peaceful discipline, steady wins"). Caption: "${(c||'').slice(0,300)}". Read what's ON SCREEN (text + visuals; he often doesn't talk). Reply ONLY minified JSON: {"hook":"opening on-screen line","onScreenText":"all text shown in order","visualSummary":"what's shown, 1 sentence","contentType":"story|teaching|result|bts|other","whyItWorks":"1-2 sentences why it stops the scroll or not"}`;

const pending = await prisma.igPost.findMany({ where: { visionAt: null }, orderBy: { publishedAt: "desc" }, take: LIMIT });
let n = 0;
for (const p of pending) {
  try {
    const isVid = p.mediaType === "REELS" || p.mediaType === "VIDEO";
    const imgs = isVid ? await frames(p.mediaUrl) : [await buf(p.mediaUrl || p.thumbnailUrl)];
    const blocks = imgs.map((b) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b.toString("base64") } }));
    if (!blocks.length) throw new Error("no frames");
    const m = await ai.messages.create({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: [...blocks, { type: "text", text: prompt(p.caption) }] }] });
    const t = (m.content[0]?.text || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const o = JSON.parse(t);
    await prisma.igPost.update({ where: { id: p.id }, data: { hook: String(o.hook||"").slice(0,300), onScreenText: String(o.onScreenText||"").slice(0,2000), visualSummary: String(o.visualSummary||"").slice(0,500), contentType: String(o.contentType||"other").slice(0,20), whyItWorks: String(o.whyItWorks||"").slice(0,600), visionAt: new Date() } });
    console.log(`✓ [${o.contentType}] ${String(o.hook).slice(0,55)}`);
    n++;
  } catch (e) { console.warn(`✗ ${p.igId}: ${e.message}`); }
}
console.log(`\nEnriched ${n}/${pending.length}`);
await prisma.$disconnect();
