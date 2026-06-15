"use client";

/**
 * The RIVEN presence orb — a warm gold "living" mark that replaces the flat
 * "R" monogram. It reacts to state, which is what makes the whole app feel
 * like a presence (Jarvis) instead of a screen:
 *
 *   rest      — calm breathing halo (idle)
 *   alert     — brighter pulsing glow (RIVEN has a read for her)
 *   listening — concentric ripples (she's talking to it)
 *   speaking  — soft waveform bars (RIVEN is talking back)
 *
 * All states honor prefers-reduced-motion (keyframes in globals.css).
 */

export type OrbState = "rest" | "alert" | "listening" | "speaking";

const SIZES = { sm: 34, md: 44, lg: 64 } as const;

export function RivenOrb({
  state = "rest",
  size = "md",
  label = false,
}: {
  state?: OrbState;
  size?: keyof typeof SIZES;
  /** Show the "R" letter inside (off for the pure-presence look). */
  label?: boolean;
}) {
  const px = SIZES[size];
  const breathClass =
    state === "rest"
      ? "riven-orb-breath"
      : state === "alert"
        ? "riven-orb-alert"
        : "";

  return (
    <span
      aria-hidden
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: px, height: px }}
    >
      {/* Listening: expanding gold rings */}
      {state === "listening" && (
        <>
          <span
            className="riven-orb-ripple absolute inset-0 rounded-full border-2 border-gold"
          />
          <span
            className="riven-orb-ripple absolute inset-0 rounded-full border-2 border-gold"
            style={{ animationDelay: "1s" }}
          />
        </>
      )}

      {/* The core orb — warm gold gradient. */}
      <span
        className={`relative rounded-full ${breathClass}`}
        style={{
          width: px,
          height: px,
          background:
            "radial-gradient(circle at 50% 38%, #E7CE92, #C9A961 60%, #9C7E3A)",
        }}
      >
        {state === "speaking" ? (
          <span className="absolute inset-0 flex items-center justify-center gap-[3px]">
            {[0, 0.15, 0.3, 0.45].map((d, i) => (
              <span
                key={i}
                className="riven-orb-wave w-[3px] rounded-full bg-charcoal"
                style={{ height: i === 2 ? px * 0.42 : px * 0.3, animationDelay: `${d}s` }}
              />
            ))}
          </span>
        ) : label ? (
          <span
            className="absolute inset-0 flex items-center justify-center font-display text-charcoal"
            style={{ fontSize: px * 0.4 }}
          >
            R
          </span>
        ) : null}
      </span>
    </span>
  );
}
