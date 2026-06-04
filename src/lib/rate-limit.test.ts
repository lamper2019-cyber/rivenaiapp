import { describe, it, expect } from "vitest";
import { rateLimit } from "./rate-limit";

// Each test uses a unique key so the shared in-memory store doesn't bleed
// between cases (the limiter is process-global by design).

describe("rateLimit", () => {
  it("allows every request up to the limit", () => {
    const key = `under-${Math.round(performance.now())}-${process.hrtime()[1]}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit and reports a retry delay", () => {
    const key = `over-${process.hrtime()[1]}`;
    for (let i = 0; i < 3; i++) rateLimit(key, 3, 60_000);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down the remaining budget", () => {
    const key = `remaining-${process.hrtime()[1]}`;
    expect(rateLimit(key, 10, 60_000).remaining).toBe(9);
    expect(rateLimit(key, 10, 60_000).remaining).toBe(8);
  });

  it("isolates one key's budget from another (one user can't lock out others)", () => {
    const a = `iso-a-${process.hrtime()[1]}`;
    const b = `iso-b-${process.hrtime()[1]}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false); // a is now blocked
    expect(rateLimit(b, 1, 60_000).ok).toBe(true); // b is unaffected
  });
});
