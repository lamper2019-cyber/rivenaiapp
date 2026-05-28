import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 is S3-compatible. We use the AWS SDK pointed at R2's endpoint.
 * Uploads happen client-side via signed PUT URLs so large media never proxies
 * through the Next.js server.
 */

export const isR2Configured =
  !!process.env.R2_ACCOUNT_ID &&
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET_NAME &&
  !!process.env.R2_PUBLIC_URL;

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  if (!isR2Configured) {
    throw new Error("R2 is not configured. Set R2_* env vars in .env.local.");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // R2 doesn't reliably sign virtual-hosted-style URLs for browser PUT
    // requests — the host doesn't match the signed bucket subdomain and the
    // request fails with SignatureDoesNotMatch. Path-style sidesteps this:
    //   https://<account>.r2.cloudflarestorage.com/<bucket>/<key>?...
    forcePathStyle: true,
  });
  return cachedClient;
}

export type SignedUploadResult = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
};

/**
 * Generate a presigned PUT URL the client can upload to directly.
 * Valid for 5 minutes.
 */
export async function presignUpload(args: {
  key: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
  });

  const expiresInSeconds = 300; // 5 min
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  return {
    uploadUrl,
    publicUrl: `${publicBase}/${args.key}`,
    key: args.key,
    expiresInSeconds,
  };
}

/**
 * Build a deterministic, sanitized key for an upload.
 * Format: <scope>/<userId>/<timestamp>-<random>.<ext>
 */
export function buildR2Key(args: {
  scope: "checkin-front" | "checkin-side" | "content" | "chat" | "voice";
  userId: string;
  fileName: string;
}): string {
  const ext = extractExtension(args.fileName);
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${args.scope}/${args.userId}/${timestamp}-${random}${ext ? `.${ext}` : ""}`;
}

function extractExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1 || idx === fileName.length - 1) return "";
  // Strip anything that isn't alphanumeric — defensive against weird filenames.
  return fileName.slice(idx + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 8);
}

/**
 * Generate a presigned GET URL for a stored R2 object, forcing the browser
 * to download it (rather than open inline) and using the desired filename.
 *
 * Used by the coach download endpoint to redirect straight to R2 instead of
 * proxying multi-minute video streams through Next.js — that proxy approach
 * is timeout-prone on Cloudflare's free 100s edge limit and memory-prone
 * on Railway containers, both of which surface as 502 Bad Gateway.
 *
 * `publicUrl` is the URL we stored in ContentSubmission. We re-derive the
 * object key by stripping the configured R2 public base.
 */
export async function presignDownload(args: {
  publicUrl: string;
  filename: string;
}): Promise<string> {
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");

  if (!args.publicUrl.startsWith(publicBase + "/")) {
    throw new Error(
      "Stored public URL doesn't match the configured R2 public base; can't sign."
    );
  }
  const key = args.publicUrl.slice(publicBase.length + 1);

  // Quote filename only if it contains a quote/backslash — keeps the header
  // simple for the common case and safe for the edge case.
  const safeFilename = args.filename.replace(/["\\]/g, "");
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeFilename}"`,
  });

  return getSignedUrl(client, command, { expiresIn: 300 });
}
