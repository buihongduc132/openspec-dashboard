/**
 * Task 5.1 — Better-Auth integration: in-process rate limiter (req 09.7).
 *
 * Token-bucket limiter in process memory, keyed per-token and per-IP
 * (design D-3a4 — no Redis for Phase 3a single-instance). The clock is
 * injectable so the refill arithmetic is deterministic under test.
 *
 *   - req 09.7 (a): limits configurable per deployment.
 *   - req 09.7 (b): 429 responses include `Retry-After` and a clear reason.
 */

/** Per-deployment rate-limit configuration (req 09.7 (a)). */
export interface RateLimitConfig {
  /** Maximum tokens a single bucket can hold (= burst size). */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSec: number;
}

/** Outcome of a `check` against the limiter. */
export interface RateLimitResult {
  /** Whether the request is allowed under the current budget. */
  allowed: boolean;
  /** HTTP status code to emit when denied (429); 0 when allowed. */
  statusCode: number;
  /** Milliseconds until the next token would be available (0 when allowed). */
  retryAfterMs: number;
  /** Human-readable reason identifying the limit (req 09.7 (b)). */
  reason: string;
}

/** Injectable monotonic clock (milliseconds). */
export type Clock = () => number;

interface Bucket {
  tokens: number;
  /** Timestamp (ms) of the last refill computation. */
  updatedAt: number;
}

/**
 * In-process token-bucket rate limiter (D-3a4).
 *
 * Each unique `key` (per-token id OR per-IP) gets an independent bucket. A
 * denied `check` reports the HTTP 429 status, a `Retry-After` in ms reflecting
 * the time until the next token refills, and a clear reason (req 09.7 (b)).
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * @param config  capacity + refill rate.
   * @param clock   injectable clock returning current ms (defaults to
   *                `Date.now`); inject a controllable clock in tests.
   */
  constructor(
    private readonly config: RateLimitConfig,
    private readonly clock: Clock = Date.now,
  ) {}

  /**
   * Attempt to consume one token for `key`.
   *
   * Returns a {@link RateLimitResult}. When the bucket has insufficient
   * tokens the request is denied with `statusCode: 429`, a positive
   * `retryAfterMs`, and a clear reason.
   */
  check(key: string): RateLimitResult {
    const now = this.clock();
    const bucket = this.getOrCreate(key, now);
    this.refill(bucket, now);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        statusCode: 0,
        retryAfterMs: 0,
        reason: "allowed",
      };
    }

    const msPerToken = 1000 / this.config.refillPerSec;
    return {
      allowed: false,
      statusCode: 429,
      retryAfterMs: Math.ceil(msPerToken),
      reason: `rate limit exceeded: ${this.config.capacity} requests per burst, ` +
        `${this.config.refillPerSec}/sec refill — retry later`,
    };
  }

  /** Internal: look up or lazily create the bucket for `key`. */
  private getOrCreate(key: string, now: number): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.capacity, updatedAt: now };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /** Internal: refill `bucket` proportionally to elapsed wall-clock time. */
  private refill(bucket: Bucket, now: number): void {
    const elapsedMs = Math.max(0, now - bucket.updatedAt);
    if (elapsedMs === 0) return;
    const refilled = (elapsedMs / 1000) * this.config.refillPerSec;
    bucket.tokens = Math.min(this.config.capacity, bucket.tokens + refilled);
    bucket.updatedAt = now;
  }
}
