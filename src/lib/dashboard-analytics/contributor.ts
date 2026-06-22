/**
 * Contributor analytics (req 7.7).
 *
 * Req 7.7: per-user metrics — tasks completed, changes archived, specs
 * authored, validation errors introduced vs resolved. AC 7.7(a): attribution
 * from audit log; an "Unattributed" bucket for CLI-only actions (null/empty
 * author). AC 7.7(b): privacy-respecting configurable anonymity mode for
 * display.
 *
 * This is the pure behavioural core; the DB fetcher assembles audit-log events.
 */

export type ContributorAction =
  | "task.completed"
  | "change.archived"
  | "spec.authored"
  | "validation.error.introduced"
  | "validation.error.resolved";

export interface ContributorEventInput {
  /** Audit-log author; null/empty/whitespace → "Unattributed" (AC 7.7a). */
  author: string | null;
  action: ContributorAction;
}

export interface ContributorStat {
  author: string;
  tasksCompleted: number;
  changesArchived: number;
  specsAuthored: number;
  validationErrorsIntroduced: number;
  validationErrorsResolved: number;
}

export interface ContributorStatsOptions {
  /** When true, replace author handles with stable pseudonyms (AC 7.7b). */
  anonymous?: boolean;
}

/** Normalise an author into its display bucket (AC 7.7a). */
function normalizeAuthor(raw: string | null): string {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Unattributed";
}

/** Empty stat record for a fresh author bucket. */
function emptyStat(author: string): ContributorStat {
  return {
    author,
    tasksCompleted: 0,
    changesArchived: 0,
    specsAuthored: 0,
    validationErrorsIntroduced: 0,
    validationErrorsResolved: 0,
  };
}

/**
 * Compute per-author contributor stats from audit-log events (req 7.7).
 *
 * AC 7.7(a): null/empty/whitespace authors collapse into "Unattributed".
 * AC 7.7(b): with `anonymous: true`, each distinct real author is shown as a
 * stable pseudonym "Contributor #N" assigned by first-seen order — the same
 * author always maps to the same pseudonym so per-user metrics remain
 * meaningful while hiding the real handle.
 *
 * Stats are returned sorted by total contributions descending (ties break by
 * display name ascending) for a stable leaderboard.
 */
export function computeContributorStats(
  events: ContributorEventInput[],
  options: ContributorStatsOptions = {}
): ContributorStat[] {
  const buckets = new Map<string, ContributorStat>();
  // Map of normalized author → pseudonym, assigned in first-seen order.
  const pseudonyms = new Map<string, string>();
  let nextId = 1;

  for (const ev of events) {
    const real = normalizeAuthor(ev.author);
    let display = real;
    if (options.anonymous) {
      if (!pseudonyms.has(real)) {
        pseudonyms.set(real, `Contributor #${nextId}`);
        nextId += 1;
      }
      display = pseudonyms.get(real)!;
    }

    let stat = buckets.get(display);
    if (!stat) {
      stat = emptyStat(display);
      buckets.set(display, stat);
    }

    switch (ev.action) {
      case "task.completed":
        stat.tasksCompleted += 1;
        break;
      case "change.archived":
        stat.changesArchived += 1;
        break;
      case "spec.authored":
        stat.specsAuthored += 1;
        break;
      case "validation.error.introduced":
        stat.validationErrorsIntroduced += 1;
        break;
      case "validation.error.resolved":
        stat.validationErrorsResolved += 1;
        break;
    }
  }

  const total = (s: ContributorStat) =>
    s.tasksCompleted +
    s.changesArchived +
    s.specsAuthored +
    s.validationErrorsIntroduced +
    s.validationErrorsResolved;

  return Array.from(buckets.values()).sort(
    (a, b) => total(b) - total(a) || a.author.localeCompare(b.author)
  );
}
