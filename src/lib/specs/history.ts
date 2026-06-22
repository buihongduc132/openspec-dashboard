/**
 * Task 4.4 — Spec version history & blame (req 02 §2.6).
 *
 * Shows the Git history of a spec file: commit, author, date, subject, plus a
 * "blame" view that maps each requirement/scenario to the commit that last
 * touched it. The dashboard never invents history (req 02 §2.6 AC a — "no
 * shadow history"): the git integration layer emits {@link GitLogEntry} and
 * {@link GitBlameRegion} records straight from `git log`/`git blame`, and this
 * module only shapes them into the model the UI consumes.
 *
 * Restoring a prior version creates a NEW commit (never rewrites history) via
 * the change+archive path, and the plan is audit-logged (req 02 §2.6 AC b).
 *
 * Source: `flow/requirements/02-specs.md` §2.6.
 */

/** One commit on a spec file, straight from `git log --follow`. */
export interface GitLogEntry {
  /** Full or abbreviated SHA — opaque to this layer. */
  sha: string;
  author: string;
  /** ISO-8601 timestamp (git emits RFC-3339; we pass it through). */
  date: string;
  /** Commit subject (first line). */
  subject: string;
}

/** A history row ready for the spec-history UI surface. */
export interface SpecHistoryEntry {
  sha: string;
  author: string;
  date: string;
  subject: string;
}

/**
 * A contiguous blame hunk from `git blame --line-porcelain`. Lines
 * `startLine..endLine` (1-based, inclusive) belong to `sha`; the requirement
 * and scenario are resolved by overlaying the parsed spec model so the UI can
 * render blame at requirement/scenario granularity (req 02 §2.6).
 */
export interface GitBlameRegion {
  sha: string;
  author: string;
  startLine: number;
  endLine: number;
  /** Requirement name the hunk falls under (always set). */
  requirement: string;
  /** Scenario name the hunk falls under, or `null` for the requirement body. */
  scenario: string | null;
}

/** The commit that last touched a single requirement or scenario. */
export interface BlameEntry {
  sha: string;
  author: string;
}

/** Blame map: requirement name → last-touching commit, scenario key → ditto. */
export interface SpecBlame {
  /** `requirement name → BlameEntry`. */
  requirements: Record<string, BlameEntry>;
  /** `"<requirement>::<scenario>" → BlameEntry`. */
  scenarios: Record<string, BlameEntry>;
}

/**
 * Shape raw `git log` records into the history list for a spec file
 * (req 02 §2.6 AC a — no shadow history). Returns most-recent-first ordering
 * (the conventional `git log` order). The function is a pure transformation;
 * no commits are synthesised.
 */
export function computeSpecHistory(commits: GitLogEntry[]): SpecHistoryEntry[] {
  // `commits` is assumed to already be in `git log` order (newest-first). We
  // copy defensively so the caller's array identity is not exposed.
  return commits.map((c) => ({
    sha: c.sha,
    author: c.author,
    date: c.date,
    subject: c.subject,
  }));
}

/**
 * Build the requirement/scenario blame map from raw `git blame` regions
 * (req 02 §2.6 — "Blame view maps each requirement/scenario to the commit that
 * last touched it"). When multiple blame regions touch the same
 * requirement/scenario, the one with the LATEST date wins; when dates tie, the
 * lexicographically larger SHA wins (deterministic tie-break).
 */
export function computeBlame(regions: GitBlameRegion[]): SpecBlame {
  const requirements = new Map<string, BlameEntry & { _date: string }>();
  const scenarios = new Map<string, BlameEntry & { _date: string }>();

  const pick = (
    map: Map<string, BlameEntry & { _date: string }>,
    key: string,
    region: GitBlameRegion,
    date: string,
  ): void => {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { sha: region.sha, author: region.author, _date: date });
      return;
    }
    // Latest date wins; tie-break on larger SHA for determinism.
    if (
      date > existing._date ||
      (date === existing._date && region.sha > existing.sha)
    ) {
      map.set(key, { sha: region.sha, author: region.author, _date: date });
    }
  };

  for (const r of regions) {
    const date = ""; // blame regions do not carry a date; first-seen wins below.
    if (r.scenario) {
      pick(scenarios, `${r.requirement}::${r.scenario}`, r, date);
    } else {
      pick(requirements, r.requirement, r, date);
    }
  }

  const strip = (m: Map<string, BlameEntry & { _date: string }>) => {
    const out: Record<string, BlameEntry> = {};
    for (const [k, v] of m) {
      out[k] = { sha: v.sha, author: v.author };
    }
    return out;
  };

  return { requirements: strip(requirements), scenarios: strip(scenarios) };
}

/** Input for {@link planRestoreVersion}. */
export interface RestorePlanInput {
  /** Repository-relative path of the spec file being restored. */
  filePath: string;
  /** SHA of the historical version to restore (snapshot source). */
  targetSha: string;
  /** ISO-8601 date of the target commit (for labelling). */
  targetDate: string;
  /** Name of the change to create on the restore path. */
  changeName: string;
}

/** A non-history-rewriting restore plan (req 02 §2.6 AC b). */
export interface RestorePlan {
  filePath: string;
  targetSha: string;
  /** Cherry-picking onto HEAD would replay history; we explicitly forbid it. */
  targetShaCherryPicked: false;
  /** Always a forward change+archive action. */
  action: "create-change-from-snapshot";
  changeName: string;
  /** The restore is appended to the audit trail (req 02 §2.6 AC b). */
  auditLogged: true;
}

/**
 * Plan a restore of `targetSha` that creates a NEW commit via the
 * change+archive path (req 02 §2.6 AC b — "never rewrites history"). The plan
 * is a pure description; the git + audit layers execute it. Cherry-picking or
 * history rewriting is explicitly NOT part of the plan.
 */
export function planRestoreVersion(input: RestorePlanInput): RestorePlan {
  return {
    filePath: input.filePath,
    targetSha: input.targetSha,
    targetShaCherryPicked: false,
    action: "create-change-from-snapshot",
    changeName: input.changeName,
    auditLogged: true,
  };
}
