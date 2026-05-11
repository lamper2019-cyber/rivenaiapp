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

  let signedUrl: string;
  try {
    signedUrl = await presignDownload({ publicUrl: sourceUrl, filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // 302 so the browser follows. R2 honors ResponseContentDisposition baked
  // into the signed URL and serves with the attachment filename header.
  return NextResponse.redirect(signedUrl, 302);
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
