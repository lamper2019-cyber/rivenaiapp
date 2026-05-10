/**
 * Coach role utilities. The `COACH_EMAIL` env var holds the email address(es)
 * that should be auto-promoted to role=COACH on first User row creation.
 * Multiple addresses can be comma-separated.
 */

export function getCoachEmails(): string[] {
  const raw = process.env.COACH_EMAIL ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function isCoachEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getCoachEmails().includes(email.toLowerCase());
}
