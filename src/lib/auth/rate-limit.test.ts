/**
 * Task 5.1 — Better-Auth integration: in-process rate limiter (req 09.7).
 *
 * req 09.7 "Rate limiting & abuse protection":
 *   (a) Limits configurable per deployment.
 *   (b) 429 responses include `Retry-After` and a clear reason.
 *
 * D-3a4: a token-bucket limiter in process memory, keyed per-token and
 * per-IP, no Redis. Clock is injectable so the bucket arithmetic is
 * deterministic under test.
 */
import { describe, it, expect } from "vitest";
import { TokenBucketLimiter, type RateLimitConfig } from "@/lib/auth/rate-limit";

/** Deterministic controllable clock for bucket tests. */
function makeClock(startMs = 0) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("TokenBucketLimiter (req 09.7a — configurable, D-3a4)", () => {
  const cfg: RateLimitConfig = {
    capacity: 3,
    refillPerSec: 1,
  };

  it("accepts requests under the capacity budget", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(cfg, clock.now);
    for (let i = 0; i < 3; i++) {
      const r = limiter.check("user:alice");
      expect(r.allowed).toBe(true);
      expect(r.retryAfterMs).toBe(0);
    }
  });

  it("returns 429-style deny with Retry-After + reason when over budget", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(cfg, clock.now);
    // drain the bucket
    for (let i = 0; i < 3; i++) limiter.check("ip:1.2.3.4");
    const denied = limiter.check("ip:1.2.3.4");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.reason).toMatch(/rate|limit|too many/i);
    expect(denied.statusCode).toBe(429);
  });

  it("refills tokens over time at the configured rate", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(cfg, clock.now);
    // drain
    for (let i = 0; i < 3; i++) limiter.check("k");
    expect(limiter.check("k").allowed).toBe(false);
    // 1 token / sec → after 1000ms one token refilled
    clock.advance(1000);
    expect(limiter.check("k").allowed).toBe(true);
    // only one refilled
    expect(limiter.check("k").allowed).toBe(false);
  });

  it("isolates buckets per key (per-token AND per-IP)", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(cfg, clock.now);
    for (let i = 0; i < 3; i++) limiter.check("user:alice");
    // alice exhausted; bob unaffected
    expect(limiter.check("user:alice").allowed).toBe(false);
    expect(limiter.check("user:bob").allowed).toBe(true);
  });

  it("honours independent per-deployment config values", () => {
    const clock = makeClock(0);
    const strict: RateLimitConfig = { capacity: 1, refillPerSec: 1 };
    const limiter = new TokenBucketLimiter(strict, clock.now);
    expect(limiter.check("k").allowed).toBe(true);
    expect(limiter.check("k").allowed).toBe(false);
  });

  it("Retry-After reflects the time until the next token", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(
      { capacity: 1, refillPerSec: 2 }, // 1 token per 500ms
      clock.now,
    );
    expect(limiter.check("k").allowed).toBe(true);
    const denied = limiter.check("k");
    expect(denied.allowed).toBe(false);
    // ~500ms until next token (allow small float slack)
    expect(denied.retryAfterMs).toBeGreaterThanOrEqual(490);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(510);
  });

  it("every 429 carries a reason identifying the limit (req 09.7b)", () => {
    const clock = makeClock(0);
    const limiter = new TokenBucketLimiter(cfg, clock.now);
    for (let i = 0; i < 3; i++) limiter.check("k");
    const denied = limiter.check("k");
    expect(denied.allowed).toBe(false);
    expect(typeof denied.reason).toBe("string");
    expect(denied.reason.length).toBeGreaterThan(0);
  });
});
