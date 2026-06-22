/**
 * Task 4.5 — Schema authoring: forking (req 05 §5.4).
 *
 * Fork provenance is a DASHBOARD-SIDE metadata field stored under
 * `openspec/.dashboard/schema-forks.json`. It is NOT an invented upstream
 * `forked_from` YAML key — the upstream key is unconfirmed and we never
 * fabricate upstream semantics. Provenance enables "diff against upstream"
 * (05.4 AC a/b) by recording the forked-from name + version + layer +
 * timestamp.
 *
 * Source: `flow/requirements/05-schemas.md` §5.4.
 */

/** The layer a fork was sourced from. */
export type SchemaLayer = "project" | "user" | "builtin";

/** Recorded fork provenance (dashboard-side metadata only). */
export interface ForkProvenance {
  forkedFromName: string;
  forkedFromVersion: string;
  forkedFromLayer: SchemaLayer;
  /** ISO-8601 timestamp of the fork operation. */
  forkedAt: string;
}

/** The on-disk manifest persisted at
 * `openspec/.dashboard/schema-forks.json`. */
export interface SchemaForksManifest {
  /** Map of fork-name → provenance. */
  forks: Record<string, ForkProvenance>;
}

/** A set of files keyed by repo-relative path within the schema dir. */
export type SchemaFileSet = Record<string, string>;

/** One file-level diff entry. */
export interface ForkDiffEntry {
  path: string;
  status: "added" | "modified" | "removed" | "unchanged";
}

/** The result of `diffAgainstUpstream`. */
export interface ForkDiff {
  entries: ForkDiffEntry[];
  changedCount: number;
}

/**
 * Return a NEW manifest with the fork provenance recorded (immutable update).
 *
 * Re-forking the same name overwrites the prior entry — the latest fork wins.
 */
export function recordForkProvenance(
  manifest: SchemaForksManifest,
  forkName: string,
  provenance: ForkProvenance,
): SchemaForksManifest {
  return {
    forks: {
      ...manifest.forks,
      [forkName]: provenance,
    },
  };
}

/**
 * Compute a file-level diff between a fork's file set and the upstream
 * file set it was forked from (05.4 AC b). Entries are sorted by path for
 * deterministic output.
 */
export function diffAgainstUpstream(
  forkFiles: SchemaFileSet,
  upstreamFiles: SchemaFileSet,
): ForkDiff {
  const paths = new Set<string>([
    ...Object.keys(forkFiles),
    ...Object.keys(upstreamFiles),
  ]);
  const entries: ForkDiffEntry[] = [];
  let changed = 0;
  for (const path of [...paths].sort()) {
    const inFork = path in forkFiles;
    const inUpstream = path in upstreamFiles;
    let status: ForkDiffEntry["status"];
    if (inFork && !inUpstream) {
      status = "added";
    } else if (!inFork && inUpstream) {
      status = "removed";
    } else if (forkFiles[path] !== upstreamFiles[path]) {
      status = "modified";
    } else {
      status = "unchanged";
    }
    if (status !== "unchanged") changed++;
    entries.push({ path, status });
  }
  return { entries, changedCount: changed };
}
