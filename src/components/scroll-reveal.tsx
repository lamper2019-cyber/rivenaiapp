"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Tiny wrapper that fades + rises its children into view the first time
 * they cross the viewport. One-shot per page load — re-scrolling past
 * a revealed section doesn't re-trigger.
 *
 * Uses the existing `riven-rise-in` keyframe in globals.css so the motion
 * matches the results-page reveals. Respects prefers-reduced-motion via
 * that same CSS rule (animation: none + opacity: 1 in the override).
 */
export function ScrollReveal({
  children,
  delay = 0,
  className = "",
  rootMargin = "-80px 0px",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // If the section is already in view on mount (e.g. landing above the
    // fold on a tall viewport), reveal immediately so we don't flash empty.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 80) {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={`${visible ? "riven-rise-in" : "opacity-0"} ${className}`.trim()}
      style={visible && delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
