"use client";

// Last-resort error boundary. This only fires if the ROOT layout itself throws
// — at that point Next.js has thrown away our normal <html>/<body>, so this
// file must render its own. Tailwind classes may not be present here, so the
// few styles we need are inlined to stay on-brand (cream + charcoal).

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "24px",
          background: "#FAF7F2",
          color: "#1A1A1A",
          fontFamily:
            "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
        }}
      >
        <h1
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: "32px",
            margin: "0 0 12px",
          }}
        >
          Let&apos;s try that again.
        </h1>
        <p style={{ maxWidth: "360px", color: "#5A5752", margin: "0 0 28px" }}>
          The app hit a snag loading. Your data is safe — give it another tap.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: "#1A1A1A",
            color: "#FAF7F2",
            border: "none",
            borderRadius: "999px",
            padding: "18px 32px",
            fontSize: "13px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
