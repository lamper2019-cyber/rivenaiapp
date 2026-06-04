// Lightweight in-memory rate limiter.
//
// Why in-memory (not Redis/Upstash): RIVEN runs as a single Railway instance,
// so a process-local counter is enough to stop runaway loops and abuse on the
// expensive endpoints (AI chat, voice transcription, file uploads). It adds no
// new service, no new dependency, and nothing for Sean to manage. If RIVEN ever
// scales to multiple instances behind a load balancer, swap the Map below for a
// shared store (Upstash Redis) — the rateLimit() signature can stay the same.
//
// Strategy: a sliding window. For each key we keep the timestamps of recent
// hits and count how many fall inside the window. Old timestamps are swept out
// periodically so the Map can't grow forever.

type Bucket = number[]; // request timestamps in ms

const store = new Map<string, Bucket>();

let lastSweep = 0;

/** Drop expired timestamps across all keys at most once per minute. */
function sweep(now: number, windowMs: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  // forEach (not for…of) so we don't depend on downlevelIteration over a Map.
  const stale: string[] = [];
  store.forEach((hits: Bucket, key: string) => {
    const fresh = hits.filter((t) => now - t < windowMs);
    if (fresh.length === 0) stale.push(key);
    else store.set(key, fresh);
  });
  stale.forEach((key) => store.delete(key));
}

export type RateLimitResult = {
  /** true if the request is allowed through. */
  ok: boolean;
  /** how many requests remain in the current window. */
  remaining: number;
  /** when blocked, seconds the caller should wait before retrying. */
  retryAfterSeconds: number;
};

/**
 * Allow up to `limit` requests per `windowMs` for a given `key`.
 *
 * @param key     a stable identifier, e.g. `chat:<userId>`. Scope it per user
 *                so one abusive account can't lock out everyone else.
 * @param limit   max requests allowed inside the window.
 * @param windowMs the window length in milliseconds.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowMs - (now - oldest)) / 1000),
    );
    store.set(key, hits);
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  hits.push(now);
  store.set(key, hits);
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}
