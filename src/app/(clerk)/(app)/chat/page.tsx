import { redirect } from "next/navigation";

/**
 * /chat retired 2026-05-27 per Sean's "keep it simple" pass.
 *
 * Sean's coaching is now a single surface — the SeanPromptHeadline
 * at the top of /dashboard. No bottom-input thread, no chat history
 * UI. He pings 3x/day via the morning/midday/evening crons; she
 * answers with chip taps. Old push notifications that still deep-link
 * to /chat (any unread iOS banner) land here and bounce her home.
 *
 * Keep the route around for the redirect — it's cheaper to hop than
 * to chase every old client-side link or stale notification payload.
 * The companion file `sean-actions.ts` lives in this folder still
 * because the chip-tap action it exports is imported by
 * SeanPromptHeadline; route segments don't need a page to host
 * server actions.
 */
export const dynamic = "force-dynamic";

export default function ChatPage() {
  redirect("/dashboard");
}
