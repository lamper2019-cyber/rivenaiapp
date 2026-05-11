import { redirect } from "next/navigation";

/**
 * /coach is a placeholder for the v2 inbox / triage view. For v1 we send
 * straight to the roster.
 */
export default function CoachIndexPage() {
  redirect("/coach/clients");
}
