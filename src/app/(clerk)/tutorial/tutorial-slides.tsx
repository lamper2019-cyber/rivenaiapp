"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  advanceTutorialStep,
  completeTutorial,
} from "@/lib/tutorial-actions";
import { TUTORIAL_TOTAL_SLIDES } from "@/lib/tutorial";

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  icon: string;
  ctaLabel: string;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Step 1 of 4",
    title: "Welcome to RIVEN.",
    body: "Here's what your week looks like with us. A few quick things before you start.",
    icon: "auto_awesome",
    ctaLabel: "Next",
  },
  {
    eyebrow: "Step 2 of 4",
    title: "Log your meals — easy as talking.",
    body: "Use the voice note when you log. You don't have to be perfect — RIVEN's AI knows the food database, so even general descriptions work (“chicken bowl from Chipotle” is enough). Be accurate when you can. Don't stress.",
    icon: "mic",
    ctaLabel: "Next",
  },
  {
    eyebrow: "Step 3 of 4",
    title: "Sunday check-ins.",
    body: "Every Sunday, you'll complete a quick check-in — weight, waist, photos, sleep, how the week went. This is how we track real progress and adjust your plan.",
    icon: "calendar_month",
    ctaLabel: "Next",
  },
  {
    eyebrow: "Step 4 of 4",
    title: "Your weekly prompt.",
    body: "Each week, you'll get one short content prompt — a quick video or voice memo. It helps Sean see how you're feeling and what's working. Takes thirty seconds.",
    icon: "videocam",
    ctaLabel: "Let's begin",
  },
];

const TRANSITION_MS = 280;

export function TutorialSlides({ startSlide }: { startSlide: number }) {
  const router = useRouter();
  // `displayed` is what the eye sees; `incoming` only differs during a transition.
  const [displayed, setDisplayed] = useState<number>(startSlide);
  const [direction, setDirection] = useState<"forward" | "idle">("idle");
  const [isPending, startTransition] = useTransition();

  const isLast = displayed === SLIDES.length - 1;
  const slide = SLIDES[displayed];

  function next() {
    if (isPending || direction !== "idle") return;
    if (isLast) {
      finishTutorial();
      return;
    }
    const target = displayed + 1;
    setDirection("forward");
    // Persist immediately in parallel with the animation — don't make
    // the user wait on the network for a smooth slide change.
    startTransition(async () => {
      const form = new FormData();
      form.append("nextStep", String(target));
      await advanceTutorialStep(form);
    });
    setTimeout(() => {
      setDisplayed(target);
      setDirection("idle");
    }, TRANSITION_MS);
  }

  function finishTutorial() {
    if (isPending) return;
    startTransition(async () => {
      await completeTutorial();
      router.replace("/dashboard");
    });
  }

  function skip() {
    if (isPending) return;
    startTransition(async () => {
      await completeTutorial();
      router.replace("/dashboard");
    });
  }

  // Animation state classes — current slide drifts up + fades during forward
  // motion; the incoming slide is rendered (with its content swapped after the
  // transition completes via setDisplayed) and animates from below.
  const slideContentClasses =
    direction === "forward"
      ? "opacity-0 -translate-y-3"
      : "opacity-100 translate-y-0";

  return (
    <main className="relative min-h-screen flex flex-col px-container-mobile md:px-container-desktop max-w-xl mx-auto pt-safe">
      {/* Top bar — skip link */}
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={skip}
          disabled={isPending}
          className="font-body text-label-md tracking-widest uppercase text-on-surface-variant hover:text-charcoal transition-colors disabled:opacity-40"
        >
          Skip
        </button>
      </div>

      {/* Slide body — centered vertically */}
      <div className="flex-1 flex flex-col justify-center pb-24">
        <div
          className={`transition-all duration-[280ms] ease-out ${slideContentClasses}`}
          aria-live="polite"
        >
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Icon mark — same visual language as the Ask RIVEN tile */}
            <div className="relative flex items-center justify-center w-20 h-20">
              <span
                className="absolute inset-0 rounded-full bg-gold/15 riven-glow"
                aria-hidden
              />
              <span
                className="absolute inset-2 rounded-full bg-cream shadow-elevation-1"
                aria-hidden
              />
              <span className="material-symbols-outlined relative text-gold text-[40px] filled">
                {slide.icon}
              </span>
            </div>

            <p className="font-body text-label-md tracking-widest uppercase text-on-surface-variant">
              {slide.eyebrow}
            </p>
            <h1 className="font-display text-headline-lg-mobile md:text-headline-lg text-charcoal text-balance max-w-md">
              {slide.title}
            </h1>
            <p className="font-body text-body-lg text-on-surface-variant leading-relaxed max-w-md">
              {slide.body}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom dock — dots + CTA */}
      <div className="pb-safe pt-2 space-y-5">
        <div
          className="flex justify-center items-center gap-2"
          aria-label={`Slide ${displayed + 1} of ${TUTORIAL_TOTAL_SLIDES}`}
        >
          {Array.from({ length: TUTORIAL_TOTAL_SLIDES }).map((_, i) => {
            const active = i === displayed;
            return (
              <span
                key={i}
                className={`block rounded-full transition-all duration-[280ms] ease-out ${
                  active ? "w-6 h-1.5 bg-charcoal" : "w-1.5 h-1.5 bg-charcoal/25"
                }`}
                aria-hidden
              />
            );
          })}
        </div>
        <button
          type="button"
          onClick={next}
          disabled={isPending || direction !== "idle"}
          className="block w-full bg-charcoal text-cream py-4 rounded-full font-body text-label-md tracking-widest uppercase shadow-elevation-1 hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {slide.ctaLabel}
        </button>
      </div>

      {/* Ambient warm glow — matches welcome / onboarding form aesthetic */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-gold/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="fixed bottom-[-5%] right-[-5%] w-[30%] h-[30%] bg-sage/5 blur-[100px] rounded-full pointer-events-none -z-10" />
    </main>
  );
}
