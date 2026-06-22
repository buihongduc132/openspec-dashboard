/**
 * Multi-project overview (req 7.2).
 *
 * Req 7.2 is the org-level rollup dashboard DISTINCT from req 1.6's
 * single-project cards. It adds cross-project rollups (total active changes,
 * total open validation errors, aggregate task completion %) and a
 * cross-project activity heatmap by day (AC 7.2b).
 *
 * These helpers are the pure behavioural core: they take per-project /
 * per-event inputs (produced by the DB fetcher in `src/db/analytics.ts`) and
 * compute the rollup + heatmap without touching the DB.
 */

export interface ProjectRollupInput {
  id: string;
  /** In-flight (non-archived) change count for this project. */
  activeChanges: number;
  /** Open validation error count for this project. */
  openValidationErrors: number;
  /** Total tasks (done + open) for this project. */
  taskTotal: number;
  /** Completed tasks for this project. */
  taskDone: number;
  /** Last audit-log activity timestamp, if any. */
  lastActivityAt: Date | null;
  /** Owner handle, if known. */
  owner: string | null;
}

export interface OrgRollup {
  projectCount: number;
  /** Σ active changes across all projects. */
  totalActiveChanges: number;
  /** Σ open validation errors across all projects. */
  totalOpenValidationErrors: number;
  /** Aggregate task completion %, rounded to the nearest integer (0–100). */
  aggregateTaskCompletionPct: number;
}

/**
 * Compute the org-level rollup over per-project inputs.
 *
 * Aggregate completion % is computed over the pooled task counts (Σ done /
 * Σ total) rather than as a mean of per-project percentages, so a project
 * with 1000 tasks isn't drowned out by a project with 2.
 */
export function computeOrgRollup(projects: ProjectRollupInput[]): OrgRollup {
  let totalActiveChanges = 0;
  let totalOpenValidationErrors = 0;
  let taskTotal = 0;
  let taskDone = 0;

  for (const p of projects) {
    totalActiveChanges += p.activeChanges;
    totalOpenValidationErrors += p.openValidationErrors;
    taskTotal += p.taskTotal;
    taskDone += p.taskDone;
  }

  const aggregateTaskCompletionPct =
    taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  return {
    projectCount: projects.length,
    totalActiveChanges,
    totalOpenValidationErrors,
    aggregateTaskCompletionPct,
  };
}

export interface ActivityEventInput {
  createdAt: Date;
}

export interface HeatmapCell {
  /** Bucket start, ISO calendar date (yyyy-mm-dd, UTC). */
  date: string;
  /** Events in this bucket. */
  count: number;
}

export interface ActivityHeatmapOptions {
  /** Trailing window length in days (AC 7.2b). */
  windowDays: number;
  /** Reference "now" for anchoring the window (injected for deterministic tests). */
  referenceNow?: Date;
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
 * Bucket cross-project audit-log events into per-day counts over a trailing
 * window (AC 7.2b — heatmap of activity by day). The window always produces
 * `windowDays` zero-filled buckets ending "today", so the heatmap axis is
 * stable regardless of where events land. Future timestamps are excluded.
 */
export function computeActivityHeatmap(
  events: ActivityEventInput[],
  options: ActivityHeatmapOptions
): HeatmapCell[] {
  const now = options.referenceNow ?? new Date();
  const bucketCount = Math.max(1, options.windowDays);

  const todayMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const buckets: HeatmapCell[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = new Date(todayMidnight);
    start.setUTCDate(start.getUTCDate() - i);
    buckets.push({ date: toUtcDay(start), count: 0 });
  }

  const nowTime = now.getTime();

  for (const ev of events) {
    const t = ev.createdAt.getTime();
    if (Number.isNaN(t) || t > nowTime) continue;

    const dayMidnight = new Date(
      Date.UTC(
        ev.createdAt.getUTCFullYear(),
        ev.createdAt.getUTCMonth(),
        ev.createdAt.getUTCDate()
      )
    );
    const dayOffset = Math.floor(
      (dayMidnight.getTime() - todayMidnight.getTime()) / MS_PER_DAY
    );
    const idx = bucketCount - 1 + dayOffset;
    if (idx < 0 || idx >= bucketCount) continue;
    buckets[idx].count += 1;
  }

  return buckets;
}
