import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { presignDownload } from "@/lib/r2";

/**
 * Coach-only download endpoint for ContentSubmission media.
 *
 * Generates a short-lived signed R2 URL (with Content-Disposition set so the
 * browser downloads instead of opens inline) and 302-redirects there. The
 * browser then talks straight to R2, bypassing Next.js entirely — no
 * streaming through Railway, no Cloudflare 100s timeout to worry about, no
 * memory pressure on multi-minute video downloads.
 *
 * We never accept a raw URL from the caller — only a submissionId we look
 * up server-side. Keeps this endpoint from being a generic open proxy.
 */
export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm role=COACH.
  const coach = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { role: true },
  });
  if (!coach || coach.role !== "COACH") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submissionId = req.nextUrl.searchParams.get("id");
  const kind = req.nextUrl.searchParams.get("kind") ?? "video";
  if (!submissionId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const submission = await prisma.contentSubmission.findUnique({
    where: { id: submissionId },
    select: {
      videoUrl: true,
      photoUrl: true,
      week: true,
      user: {
        select: {
          email: true,
          profile: { select: { name: true } },
        },
      },
    },
  });

  if (!submission) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sourceUrl = kind === "photo" ? submission.photoUrl : submission.videoUrl;
  if (!sourceUrl) {
    return NextResponse.json({ error: "No file for that kind" }, { status: 404 });
  }

  const clientName =
    submission.user.profile?.name?.replace(/[^a-zA-Z0-9]/g, "-") ??
    submission.user.email.split("@")[0];
  const dateLabel = submission.week.toISOString().slice(0, 10);
  const ext = guessExtension(sourceUrl, kind);
  const filename = `riven-${clientName}-${dateLabel}.${ext}`;

  // Three-step fallback to handle the "R2 returns 404" case gracefully:
  //   1. Try signing — proper filename, attachment header. HEAD-verify.
  //   2. If that fails, HEAD-check the stored public URL.
  //   3. If BOTH 404 (file is genuinely missing in R2), serve a branded
  //      "file not available" page instead of redirecting to R2's robot 404.
  let signedUrl: string | null = null;
  let signedStatus: number | null = null;
  try {
    signedUrl = await presignDownload({ publicUrl: sourceUrl, filename });
    const head = await fetch(signedUrl, { method: "HEAD" });
    signedStatus = head.status;
    if (!head.ok) signedUrl = null;
  } catch (err) {
    console.error("[coach/download] presignDownload threw:", err);
    signedUrl = null;
  }

  if (signedUrl) return NextResponse.redirect(signedUrl, 302);

  // Signed path failed — try the public URL as fallback. If it 200s,
  // redirect there (no custom filename, but file downloads).
  let publicStatus: number | null = null;
  try {
    const head = await fetch(sourceUrl, { method: "HEAD" });
    publicStatus = head.status;
    if (head.ok) return NextResponse.redirect(sourceUrl, 302);
  } catch (err) {
    console.error("[coach/download] public URL HEAD threw:", err);
  }

  // Both paths failed → the file is genuinely missing from R2. Log what we
  // know so it can be diagnosed (env mismatch vs. broken upload vs. wiped
  // bucket) and show the coach a branded explanation, not R2's robot page.
  console.error(
    `[coach/download] both URLs returned non-2xx for submission ${submissionId} (signed=${signedStatus}, public=${publicStatus}). Source: ${sourceUrl}`
  );

  return new Response(buildMissingFileHtml(), {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function buildMissingFileHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="color-scheme" content="light" />
<title>RIVEN — File not available</title>
<style>
  body { background:#FAF7F2; color:#1A1A1A; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; min-height:100vh; margin:0; display:flex; align-items:center; justify-content:center; padding:24px; }
  .card { max-width:420px; text-align:left; }
  .eyebrow { font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:#4A4744; margin:0 0 12px; }
  h1 { font-family:Georgia,"Times New Roman",serif; font-size:28px; line-height:1.2; margin:0 0 12px; font-weight:400; }
  p { font-size:16px; line-height:1.5; color:#4A4744; margin:0 0 12px; }
  .meta { font-size:13px; color:#4A4744; opacity:.7; margin-top:24px; padding-top:16px; border-top:1px solid #D4CFC6; }
  .actions { margin-top:24px; }
  a.btn { display:inline-block; background:#1A1A1A; color:#FAF7F2; padding:14px 28px; text-decoration:none; border-radius:999px; font-size:13px; letter-spacing:.18em; text-transform:uppercase; }
</style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">Content submission</p>
    <h1>This recording isn't available.</h1>
    <p>The file isn't in storage — either the upload didn't finish, or the bucket's public access was rotated since this was submitted.</p>
    <p>Ask the client to re-record this week's prompt. The new upload will land cleanly.</p>
    <div class="actions"><a class="btn" href="javascript:history.back()">Back</a></div>
    <p class="meta">If this happens on every download, your R2 public URL config likely changed since old uploads were stored.</p>
  </div>
</body>
</html>`;
}

function guessExtension(url: string, kind: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (match) return match[1].toLowerCase();
  } catch {
    /* malformed url — fall through */
  }
  return kind === "photo" ? "jpg" : "mp4";
}
