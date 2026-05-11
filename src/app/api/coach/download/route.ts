import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Coach-only download endpoint for ContentSubmission media.
 *
 * Streams the file out of R2 with `Content-Disposition: attachment` so the
 * browser actually downloads (vs. opening inline). We never accept a raw URL
 * — caller passes a submissionId, we look up the URL server-side. This keeps
 * the endpoint from being a generic open proxy / SSRF vector.
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

  const upstream = await fetch(sourceUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 }
    );
  }

  const clientName =
    submission.user.profile?.name?.replace(/[^a-zA-Z0-9]/g, "-") ??
    submission.user.email.split("@")[0];
  const dateLabel = submission.week.toISOString().slice(0, 10);
  const ext = guessExtension(sourceUrl, kind);
  const filename = `riven-${clientName}-${dateLabel}.${ext}`;

  // Re-stream from R2 with attachment headers.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ??
        (kind === "photo" ? "image/jpeg" : "video/mp4"),
      "content-length": upstream.headers.get("content-length") ?? "",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, max-age=0, no-store",
    },
  });
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
