"use client";

import { useEffect, useState } from "react";

type RotatingTextProps = {
  /** Lines to cycle through, in order. */
  lines: readonly string[];
  /** Milliseconds each line is displayed before flipping. */
  intervalMs?: number;
  /** Visual variant. */
  variant?: "block" | "inline";
  /** Tailwind classes applied to the visible text span. */
  className?: string;
};

/**
 * Cycles through `lines` with a flip-up animation. Respects
 * prefers-reduced-motion (just swaps without animating).
 */
export function RotatingText({
  lines,
  intervalMs = 3500,
  variant = "block",
  className = "",
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
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
    const flipDuration = reducedMotion ? 0 : 320;
    const id = setInterval(() => {
      setAnimating(true);
      // Wait through the "leaving" half of the animation, then swap line.
      setTimeout(() => {
        setIndex((i) => (i + 1) % lines.length);
        setAnimating(false);
      }, flipDuration);
    }, intervalMs);
    return () => clearInterval(id);
  }, [lines, intervalMs, reducedMotion]);

  const Wrapper = variant === "block" ? "div" : "span";

  return (
    <Wrapper className={`overflow-hidden ${variant === "block" ? "block" : "inline-block"}`}>
      <span
        key={index}
        className={`block transition-all duration-300 ease-out ${
          animating
            ? "opacity-0 -translate-y-2"
            : "opacity-100 translate-y-0 animate-in fade-in slide-in-from-bottom-2"
        } ${className}`}
      >
        {lines[index]}
      </span>
    </Wrapper>
  );
}
