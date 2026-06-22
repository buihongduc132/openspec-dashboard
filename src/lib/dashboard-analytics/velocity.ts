/**
 * Task velocity computation (req 7.5).
 *
 * Velocity = tasks completed per day/week. The burn-up chart feeds off
 * audit-log task-completion events (req 7.5a). `computeVelocity` is the pure
 * behavioural core: it buckets raw completion timestamps into a configurable
 * trailing window (req 7.5b — last 7 / 30 / 90 days, day or week granularity).
 *
 * Keeping this pure lets the chart be unit-tested without a DB and lets the
 * DB layer (`src/db/analytics.ts`) stay a thin fetcher.
 */

export type VelocityGranularity = "day" | "week";

export interface VelocityOptions {
  /** Trailing window length in days (req 7.5b: 7 / 30 / 90). */
  windowDays: number;
  /** Bucket granularity. Defaults to `"day"`. */
  bucket?: VelocityGranularity;
  /**
   * Reference "now" for anchoring the window. Injected so tests are
   * deterministic; defaults to the wall clock.
   */
  referenceNow?: Date;
}

export interface VelocityPoint {
  /** Bucket start, ISO calendar date (yyyy-mm-dd, UTC). */
  date: string;
  /** Tasks completed in this bucket. */
  completed: number;
}

export interface VelocitySeries {
  buckets: VelocityPoint[];
  /** Total completions inside the window. */
  total: number;
}

const MS_PER_DAY = 86_400_000;

/** Format a Date as a UTC yyyy-mm-dd calendar string. */
function toUtcDay(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bucket a list of task-completion timestamps into an even trailing window.
 *
 * The window always produces `ceil(windowDays / spanDays)` zero-filled buckets
 * ending "today", so the chart has a stable axis regardless of where
 * completions land. Completions outside the window (or in the future) are
 * excluded — membership is defined by landing in a valid bucket.
 */
export function computeVelocity(
  completions: Date[],
  options: VelocityOptions
): VelocitySeries {
  const granularity: VelocityGranularity = options.bucket ?? "day";
  const spanDays = granularity === "week" ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(options.windowDays / spanDays));
  const now = options.referenceNow ?? new Date();

  const todayMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  // Build zero-filled buckets in chronological order (oldest → newest).
  const buckets: VelocityPoint[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = new Date(todayMidnight);
    start.setUTCDate(start.getUTCDate() - i * spanDays);
    buckets.push({ date: toUtcDay(start), completed: 0 });
  }

  const nowTime = now.getTime();
  let total = 0;

  for (const ts of completions) {
    const t = ts.getTime();
    if (Number.isNaN(t) || t > nowTime) continue;

    const dayMidnight = new Date(
      Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())
    );
    const dayOffset = Math.floor(
      (dayMidnight.getTime() - todayMidnight.getTime()) / MS_PER_DAY
    ); // 0 = today, negative = past
    const bucketIdx = bucketCount - 1 + Math.floor(dayOffset / spanDays);
    if (bucketIdx < 0 || bucketIdx >= bucketCount) continue;

    buckets[bucketIdx].completed += 1;
    total += 1;
  }

  return { buckets, total };
}
