"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitContent, type SubmitContentResult } from "./actions";

const initialState: SubmitContentResult = { ok: false, error: "" };

export function ContentForm({ onboarded }: { onboarded: boolean }) {
  const [state, formAction] = useFormState(submitContent, initialState);
  const [videoUrl, setVideoUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();

  function handleFile(file: File) {
    setUploadError(null);
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      setUploadError("Pick a video (MP4/MOV) or an image (JPG/PNG/HEIC).");
      return;
    }

    startUpload(async () => {
      try {
        // Some browsers don't fill file.type for videos — fall back to
        // a sensible default so the sign endpoint doesn't reject the request
        // before it gets to look at the file extension.
        const inferredType =
          file.type ||
          (isVideo ? "video/mp4" : isImage ? "image/jpeg" : "application/octet-stream");

        const sign = await fetch("/api/r2/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: inferredType,
            contentLength: file.size,
            scope: "content",
          }),
        });

        if (!sign.ok) {
          const data = await sign.json().catch(() => ({}));
          throw new Error(data.error ?? `Sign failed (${sign.status}). Try a smaller file or different format.`);
        }

        const { uploadUrl, publicUrl } = (await sign.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };

        const put = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": inferredType },
        });
        if (!put.ok) {
          const body = await put.text().catch(() => "");
          throw new Error(
            `Upload to R2 failed (${put.status}). ${body.slice(0, 200) || "Check your bucket CORS policy in the Cloudflare dashboard."}`
          );
        }

        if (isVideo) {
          setVideoUrl(publicUrl);
          setPhotoUrl("");
        } else {
          setPhotoUrl(publicUrl);
          setVideoUrl("");
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Upload failed — check your network and try again.";
        setUploadError(msg);
      }
    });
  }

  const hasUpload = !!videoUrl || !!photoUrl;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="videoUrl" value={videoUrl} />
      <input type="hidden" name="photoUrl" value={photoUrl} />

      {hasUpload ? (
        <div className="rounded-md overflow-hidden bg-surface-container border border-outline-variant/60 shadow-elevation-1">
          {videoUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[60vh] bg-charcoal"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="Your submission"
              className="w-full max-h-[60vh] object-contain bg-charcoal"
            />
          )}
          <div className="px-gutter py-3 flex items-center justify-between">
            <p className="font-body text-label-sm text-on-surface-variant">
              {videoUrl ? "Video uploaded" : "Photo uploaded"}
            </p>
            <button
              type="button"
              onClick={() => {
                setVideoUrl("");
                setPhotoUrl("");
              }}
              className="font-body text-label-sm text-charcoal underline underline-offset-4"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full aspect-video rounded-md border-2 border-dashed border-outline-variant bg-surface-container-lowest cursor-pointer hover:border-gold transition-colors ${
            !onboarded ? "opacity-60 cursor-not-allowed" : ""
          }`}
        >
          <input
            type="file"
            accept="video/*,image/*"
            disabled={!onboarded || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="sr-only"
          />
          <span className="material-symbols-outlined text-charcoal/60 text-5xl">
            {uploading ? "hourglass_empty" : "videocam"}
          </span>
          <span className="font-body text-body-md text-on-surface-variant mt-2">
            {uploading ? "Uploading…" : "Tap to record or choose a file"}
          </span>
          <span className="font-body text-label-sm text-on-surface-variant/70 mt-1">
            MP4, MOV, WebM up to 200 MB · or an image up to 15 MB
          </span>
        </label>
      )}

      {uploadError && (
        <p className="font-body text-label-sm text-soft-red">{uploadError}</p>
      )}

      {state.ok === false && state.error && (
        <div className="rounded-md border border-soft-red/40 bg-soft-red/10 px-gutter py-3">
          <p className="font-body text-body-md text-soft-red">{state.error}</p>
        </div>
      )}

      <SubmitButton disabled={!onboarded || !hasUpload || uploading} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="block w-full text-center bg-charcoal text-cream py-5 rounded-full font-body text-label-md tracking-widest uppercase transition-all active:scale-95 hover:opacity-90 shadow-elevation-2 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Submitting…" : "Submit my recording"}
    </button>
  );
}
