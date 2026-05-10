"use client";

import { useEffect, useRef, useState } from "react";

type RotatingTextProps = {
  /** Lines to cycle through, in order. */
  lines: readonly string[];
  /** Milliseconds each line is fully visible before fading to the next. */
  intervalMs?: number;
  /** Total length of the crossfade in milliseconds. */
  transitionMs?: number;
  /** Tailwind classes applied to the visible text span. */
  className?: string;
};

/**
 * Smooth crossfade rotator. Two layers stacked on top of each other — only
 * one is opacity:1 at any moment, and the other fades in/out so the change
 * never "snaps". Respects prefers-reduced-motion (does an instant swap).
 */
export function RotatingText({
  lines,
  intervalMs = 4200,
  transitionMs = 800,
  className = "",
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);
  const [showA, setShowA] = useState(true);
  const indexARef = useRef(0);
  const indexBRef = useRef(1 % Math.max(lines.length, 1));
  const [, force] = useState(0);

  // Track whether reduced motion is requested.
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
    const id = setInterval(() => {
      // Advance index to the NEXT line, write it into the hidden layer,
      // then flip showA to crossfade.
      setIndex((prev) => {
        const next = (prev + 1) % lines.length;
        if (showA) {
          indexBRef.current = next;
        } else {
          indexARef.current = next;
        }
        // Force a re-render so the hidden layer picks up the new text BEFORE
        // the crossfade kicks in (otherwise the old text fades into the
        // SAME text).
        force((n) => n + 1);
        // On the next tick, flip the visible layer.
        setTimeout(() => setShowA((v) => !v), 16);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, intervalMs, showA]);

  const lineA = lines[indexARef.current] ?? lines[0] ?? "";
  const lineB = lines[indexBRef.current] ?? lines[0] ?? "";
  const duration = reducedMotion ? 0 : transitionMs;

  return (
    <span
      className="relative block overflow-hidden"
      style={{ minHeight: "1.5em" }}
      aria-live="polite"
      aria-atomic="true"
      // Hide the inert layer from screen readers.
    >
      <span
        className={`block ${className}`}
        style={{
          opacity: showA ? 1 : 0,
          transition: `opacity ${duration}ms ease-in-out`,
        }}
        aria-hidden={!showA}
      >
        {lineA}
      </span>
      <span
        className={`block absolute inset-0 ${className}`}
        style={{
          opacity: showA ? 0 : 1,
          transition: `opacity ${duration}ms ease-in-out`,
        }}
        aria-hidden={showA}
      >
        {lineB}
      </span>
      {/* Invisible label that mirrors the current line, so screen readers
          announce only the live one regardless of which layer holds it. */}
      <span className="sr-only">{lines[index] ?? ""}</span>
    </span>
  );
}
