import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
  scope: "checkin-front" | "checkin-side" | "content" | "chat";
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
