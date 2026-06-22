/**
 * Archive analytics (req 7.6).
 *
 * Req 7.6: archive frequency, average change duration (creation → archive),
 * most-modified spec domains across archives. AC 7.6(a): sourced from archived
 * changes (creation + archive timestamps, touched domains). AC 7.6(b):
 * "slowest changes" leaderboard to surface bottlenecks.
 *
 * This is the pure behavioural core; the DB fetcher assembles per-archived-
 * change inputs.
 */

export interface ArchiveChangeInput {
  projectId: string;
  changeId: string;
  changeName: string;
  /** When the change was created. */
  createdAt: Date;
  /** When the change was archived. */
  archivedAt: Date;
  /** Spec domain ids touched by this change's deltas. */
  domainIds: string[];
}

export interface ArchiveFrequencyPoint {
  /** Calendar month, UTC yyyy-mm. */
  month: string;
  /** Archives in this month. */
  count: number;
}

export interface ModifiedDomainRank {
  domainId: string;
  archiveCount: number;
}

export interface SlowestChangeRow {
  projectId: string;
  changeId: string;
  changeName: string;
  /** Duration in days (creation → archive). */
  durationDays: number;
}

export interface ArchiveAnalytics {
  averageChangeDurationDays: number;
  archiveFrequency: ArchiveFrequencyPoint[];
  mostModifiedDomains: ModifiedDomainRank[];
  /** Slowest-first leaderboard (AC 7.6b). */
  slowestChanges: SlowestChangeRow[];
}

const MS_PER_DAY = 86_400_000;

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function durationDays(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return ms / MS_PER_DAY;
}

/**
 * Compute the archive-analytics bundle over per-archived-change inputs.
 *
 * - Average duration is the mean of per-change durations (creation → archive).
 * - Archive frequency buckets archives by UTC calendar month.
 * - Most-modified domains counts how many archives touched each domain id;
 *   tied domains are ordered by domain id for determinism.
 * - Slowest-changes leaderboard is sorted descending by duration; ties break
 *   by change id for determinism.
 */
export function computeArchiveAnalytics(
  archived: ArchiveChangeInput[]
): ArchiveAnalytics {
  if (archived.length === 0) {
    return {
      averageChangeDurationDays: 0,
      archiveFrequency: [],
      mostModifiedDomains: [],
      slowestChanges: [],
    };
  }

  let totalDuration = 0;
  for (const c of archived) {
    totalDuration += durationDays(c.createdAt, c.archivedAt);
  }
  const averageChangeDurationDays = totalDuration / archived.length;

  // Archive frequency by month (sorted chronologically).
  const byMonth = new Map<string, number>();
  for (const c of archived) {
    const key = monthKey(c.archivedAt);
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  const archiveFrequency: ArchiveFrequencyPoint[] = Array.from(byMonth.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  // Most-modified domains across archives (descending count, then domain id).
  const domainCounts = new Map<string, number>();
  for (const c of archived) {
    for (const did of c.domainIds) {
      domainCounts.set(did, (domainCounts.get(did) ?? 0) + 1);
    }
  }
  const mostModifiedDomains: ModifiedDomainRank[] = Array.from(
    domainCounts.entries()
  )
    .map(([domainId, archiveCount]) => ({ domainId, archiveCount }))
    .sort(
      (a, b) => b.archiveCount - a.archiveCount || a.domainId.localeCompare(b.domainId)
    );

  // Slowest-changes leaderboard (descending duration, then change id).
  const slowestChanges: SlowestChangeRow[] = archived
    .map((c) => ({
      projectId: c.projectId,
      changeId: c.changeId,
      changeName: c.changeName,
      durationDays: durationDays(c.createdAt, c.archivedAt),
    }))
    .sort(
      (a, b) =>
        b.durationDays - a.durationDays || a.changeId.localeCompare(b.changeId)
    );

  return {
    averageChangeDurationDays,
    archiveFrequency,
    mostModifiedDomains,
    slowestChanges,
  };
}
