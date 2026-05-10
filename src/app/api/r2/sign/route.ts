import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, isClerkConfigured } from "@/lib/auth";
import { isR2Configured, presignUpload, buildR2Key } from "@/lib/r2";

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

const BodySchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().min(1),
  scope: z.enum(["checkin-front", "checkin-side", "content", "chat"]),
});

export async function POST(req: Request) {
  if (!isR2Configured) {
    return NextResponse.json(
      {
        error:
          "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL in .env.local.",
      },
      { status: 503 }
    );
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json(
      {
        error: isClerkConfigured
          ? "Not signed in."
          : "Add real Clerk keys to .env.local to upload.",
      },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { fileName, contentType, contentLength, scope } = parsed.data;

  const isImage = ALLOWED_IMAGE_TYPES.has(contentType);
  const isVideo = ALLOWED_VIDEO_TYPES.has(contentType);

  if (!isImage && !isVideo) {
    return NextResponse.json(
      {
        error: `Unsupported content type: ${contentType}. Use JPEG, PNG, WebP, HEIC for images or MP4, MOV, WebM for video.`,
      },
      { status: 415 }
    );
  }

  // Reject scope/type mismatches: check-in scopes must be images, content scope can be either.
  if (
    (scope === "checkin-front" || scope === "checkin-side" || scope === "chat") &&
    !isImage
  ) {
    return NextResponse.json(
      { error: `Scope ${scope} requires an image upload.` },
      { status: 400 }
    );
  }

  const sizeLimit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (contentLength > sizeLimit) {
    const limitMb = Math.round(sizeLimit / (1024 * 1024));
    return NextResponse.json(
      { error: `File too large. ${isImage ? "Image" : "Video"} limit is ${limitMb} MB.` },
      { status: 413 }
    );
  }

  const key = buildR2Key({ scope, userId, fileName });
  const signed = await presignUpload({ key, contentType });

  return NextResponse.json(signed);
}
