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

  // Try the signed-URL path first (gives us the proper attachment filename),
  // but verify it actually resolves before sending the browser there.
  // Background: R2 has returned NoSuchKey in production for some submissions,
  // most likely because R2_PUBLIC_URL and R2_BUCKET_NAME on Railway don't
  // match what was used when the file was uploaded — so our extracted key
  // doesn't exist in the bucket we're signing against. The public CDN URL
  // (sourceUrl) still works because R2's public host serves whatever path
  // resolves there. If signing or HEAD verification fails, fall back so the
  // coach still gets the file.
  let signedUrl: string | null = null;
  try {
    signedUrl = await presignDownload({ publicUrl: sourceUrl, filename });
    const head = await fetch(signedUrl, { method: "HEAD" });
    if (!head.ok) {
      console.error(
        `[coach/download] signed URL returned ${head.status} for submission ${submissionId}; falling back to public URL.`
      );
      signedUrl = null;
    }
  } catch (err) {
    console.error("[coach/download] presignDownload threw:", err);
    signedUrl = null;
  }

  // 302 to whichever URL we trust. Signed URL has Content-Disposition:
  // attachment baked in (preferred). Fallback public URL downloads with
  // R2's default Content-Disposition (usually inline) — coach can still
  // save-as in the browser.
  return NextResponse.redirect(signedUrl ?? sourceUrl, 302);
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
