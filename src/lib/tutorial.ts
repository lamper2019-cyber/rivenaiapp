/**
 * Post-profile tutorial constants. Lives in its own (non-"use server")
 * module because Next.js forbids "use server" files from exporting anything
 * other than async functions — actions stay in tutorial-actions.ts, the
 * shared constants live here.
 */

export const TUTORIAL_TOTAL_SLIDES = 4;

/**
 * Profile.tutorialStep value that means "walkthrough complete." Any value
 * < this means the user still has slides to see; anything ≥ this means
 * skip the tutorial and route straight to the dashboard.
 */
export const TUTORIAL_DONE_STEP = 5;
