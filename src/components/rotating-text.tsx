"use client";

import { useEffect, useState } from "react";

type RotatingTextProps = {
  /** Lines to cycle through, in order. */
  lines: readonly string[];
  /** Milliseconds each line is fully visible before transitioning. */
  intervalMs?: number;
  /** Total length of the slide-down transition. */
  transitionMs?: number;
  /** Tailwind classes applied to the visible text. */
  className?: string;
  /**
   * Max lines a single prompt may wrap to before being truncated. The container
   * reserves height for this many lines so the layout doesn't jump. Defaults
   * to 1 (single-line w/ ellipsis — original behavior).
   */
  maxLines?: number;
};

/**
 * Smooth slide-down rotator. The outgoing line glides down and fades out while
 * the incoming line settles into place from slightly above. Eased so it never
 * "snaps." Respects prefers-reduced-motion (does an instant swap).
 *
 * Visual: think of a notification rolling in from the top, not a slot machine.
 */
export function RotatingText({
  lines,
  intervalMs = 5600,
  transitionMs = 1000,
  className = "",
  maxLines = 1,
}: RotatingTextProps) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [nextIdx, setNextIdx] = useState(1 % Math.max(lines.length, 1));
  const [phase, setPhase] = useState<"rest" | "transitioning">("rest");

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (lines.length <= 1) return;
    const tick = setInterval(() => {
      if (reducedMotion) {
        // No animation — just hop to the next line.
        setCurrentIdx((i) => {
          const n = (i + 1) % lines.length;
          setNextIdx((n + 1) % lines.length);
          return n;
        });
        return;
      }

      // Start the slide. After transitionMs, snap state to the new "rest" position.
      setPhase("transitioning");
      const cleanup = setTimeout(() => {
        setCurrentIdx(nextIdx);
        setNextIdx((nextIdx + 1) % lines.length);
        setPhase("rest");
      }, transitionMs);
      return () => clearTimeout(cleanup);
    }, intervalMs);
    return () => clearInterval(tick);
  }, [lines, intervalMs, transitionMs, nextIdx, reducedMotion]);

  const lineHeightEm = 1.4;
  const containerHeightEm = lineHeightEm * Math.max(1, maxLines);
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";
  const duration = reducedMotion ? 0 : transitionMs;

  // Two stacked text layers in a fixed-height window. While "rest", the
  // current line sits at y=0 and the incoming line is parked one full
  // container above (y=-100%). While "transitioning", both translate down
  // by 100% — the incoming slides into y=0, the outgoing slides off-screen
  // below. When maxLines > 1 the layers may wrap, so we drop nowrap/ellipsis
  // and let CSS line-clamp truncate only past the reserved height.
  const wrapping = maxLines > 1;
  const layerWrapClasses = wrapping
    ? "block overflow-hidden"
    : "whitespace-nowrap overflow-hidden text-ellipsis";
  const layerClampStyle: React.CSSProperties = wrapping
    ? {
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
      }
    : {};

  return (
    <span
      className="relative block overflow-hidden"
      style={{
        height: `${containerHeightEm}em`,
        lineHeight: `${lineHeightEm}em`,
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Outgoing line — starts at y=0, slides to y=+100% */}
      <span
        className={`absolute inset-x-0 ${layerWrapClasses} ${className}`}
        style={{
          ...layerClampStyle,
          top: 0,
          transform: phase === "rest" ? "translateY(0)" : "translateY(100%)",
          opacity: phase === "rest" ? 1 : 0,
          transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ease-out`,
          willChange: "transform, opacity",
        }}
      >
        {lines[currentIdx] ?? ""}
      </span>

      {/* Incoming line — starts at y=-100%, slides to y=0 */}
      <span
        className={`absolute inset-x-0 ${layerWrapClasses} ${className}`}
        style={{
          ...layerClampStyle,
          top: 0,
          transform: phase === "rest" ? "translateY(-100%)" : "translateY(0)",
          opacity: phase === "rest" ? 0 : 1,
          transition: `transform ${duration}ms ${easing}, opacity ${duration}ms ease-in`,
          willChange: "transform, opacity",
        }}
      >
        {lines[nextIdx] ?? ""}
      </span>

      {/* Screen-reader text mirrors whichever line is currently visible. */}
      <span className="sr-only">
        {lines[phase === "rest" ? currentIdx : nextIdx] ?? ""}
      </span>
    </span>
  );
}
