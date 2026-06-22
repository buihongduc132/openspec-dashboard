/**
 * Task 4.2 — Change richness model (req 03.11, 03.12, 03.14–03.16).
 *
 * The "richness" layer over changes: artifact dependency graph
 * visualization, custom artifact support, bulk archive ordering, change
 * sync (no-archive), and archive browsing + restore. These types describe
 * the framework-agnostic pure view the logic modules operate on; route/UI
 * layers compose them with the filesystem projection + git + audit log.
 */

/** Built-in artifact types of the canonical `spec-driven` schema. */
export const BUILTIN_ARTIFACT_TYPES = ["proposal", "design", "tasks"] as const;
export type BuiltinArtifactType = (typeof BUILTIN_ARTIFACT_TYPES)[number];

/** A schema-declared artifact, built-in OR custom (req 03.12). */
export interface ArtifactDescriptor {
  /** Unique artifact type id (e.g. "proposal", or a custom "api-spec"). */
  type: string;
  /** True when the artifact is a built-in of the `spec-driven` schema. */
  builtin: boolean;
  /** Known Markdown editor template; null → plain Markdown editor (03.12 a). */
  template: string | null;
}

/** Status overlay color for a graph node (req 03.11, mirrors ArtifactStatus). */
export type GraphNodeStatus = "done" | "ready" | "blocked" | "invalid";

/** A node in the artifact dependency DAG (req 03.11). */
export interface ArtifactNode {
  artifact: ArtifactDescriptor;
  status: GraphNodeStatus;
}

/** A dependency edge in the artifact DAG (requirement: A before B). */
export interface ArtifactEdge {
  /** Artifact type that must complete first. */
  from: string;
  /** Artifact type that depends on `from`. */
  to: string;
}

/** A resolved 2-D position for a graph node (req 03.11 AC a: stable layout). */
export interface ArtifactPosition {
  type: string;
  /** 0-based column (rank) in the layered layout. */
  column: number;
  /** 0-based row within the column, tie-broken lexicographically. */
  row: number;
}

/** A laid-out artifact graph ready to render (req 03.11). */
export interface ArtifactGraph {
  nodes: ArtifactNode[];
  edges: ArtifactEdge[];
  positions: ArtifactPosition[];
}

/** A schema's artifact set + the DAG between them. */
export interface SchemaArtifactDag {
  artifacts: ArtifactDescriptor[];
  edges: ArtifactEdge[];
}

/** Result of an attempted topological ordering. */
export interface TopoResult<T> {
  /** Successfully ordered items (empty when `cycle` is present). */
  order: T[];
  /** The cycle that blocked ordering, when present. */
  cycle: string[] | null;
}

/** A change participating in a bulk archive (req 03.14). */
export interface BulkChangeInput {
  /** Change name (kebab-case, used for deterministic tie-break). */
  name: string;
  /**
   * Requirement titles this change's delta touches, keyed by verb for the
   * inter-change dependency matrix: ADDED/REMOVED/MODIFIED/RENAMED.
   */
  adds: string[];
  removes: string[];
  modifies: string[];
}

/** A single bulk-archive ordering conflict (req 03.14 AC b). */
export interface BulkArchiveConflict {
  /** Cycle of change names that could not be topologically ordered. */
  cycle: string[];
  /** Human-readable reason quoted to the user (03.14 AC b). */
  reason: string;
}

/** Result of ordering + conflict-detecting a bulk archive set (req 03.14). */
export interface BulkArchivePlan {
  /** Topological archive order (empty when `conflict` present). */
  order: string[];
  /** The detected cycle, when present (03.14 AC b). */
  conflict: BulkArchiveConflict | null;
}

/** A recorded sync event in the sidecar (req 03.15). */
export interface SyncRecord {
  /** Change name the sync was performed against. */
  change: string;
  /** Monotonic batch id assigned per (re)sync. */
  batchId: number;
  /** Requirement titles applied in this sync batch. */
  appliedTitles: string[];
  /** ISO-8601 UTC timestamp of the sync. */
  syncedAt: string;
}

/** Result of a re-sync attempt against prior records (req 03.15 AC a). */
export interface SyncResult {
  /** Records actually applied this round (already-applied deltas skipped). */
  applied: SyncRecord[];
  /** Requirement titles skipped because already applied. */
  skippedTitles: string[];
}

/** An archived change as projected from `changes/archive/` (req 03.16). */
export interface ArchivedChange {
  /** Change name (folder basename after the date prefix). */
  name: string;
  /** ISO-8601 calendar date parsed from the `YYYY-MM-DD-<name>` folder. */
  archivedDate: string;
  /** Concatenated text of the archived artifacts (search corpus, req 03.16). */
  content: string;
}

// ─── 06.4b File-level conflict detection (task 4.3) ─────────────────────────

/**
 * A change participating in a file-level conflict check (req 06.4b).
 *
 * Each entry pairs a change name with the set of spec domains it touches,
 * keyed by domain → the expected base hash the change was pinned against
 * (i.e. the content hash of `specs/<domain>.md` at the moment the change's
 * delta was authored). The detector compares these against the current
 * main-spec hashes to surface concurrent edits.
 */
export interface FileConflictChangeInput {
  /** Change name (kebab-case, used for deterministic ordering). */
  name: string;
  /** Domain → expected base hash the change was pinned against. */
  baseHashes: Record<string, string>;
}

/** A single file-level conflict: a change's pinned base diverged from main. */
export interface FileLevelConflict {
  /** The change whose expected base hash diverged. */
  change: string;
  /** The spec domain whose main-spec file diverged. */
  domain: string;
  /** The hash the change expected; null only on input error (never here). */
  expectedBaseHash: string;
  /**
   * The current main-spec content hash for `domain`, or `null` when the
   * domain no longer exists in the main spec (it was removed upstream since
   * the change was pinned).
   */
  currentMainHash: string | null;
}

/** Result of a file-level conflict scan across a candidate archive set. */
export interface FileConflictReport {
  /** Every conflict detected, sorted by (change, domain). */
  conflicts: FileLevelConflict[];
  /** True iff there are no conflicts (equivalent to `canArchive`). */
  clean: boolean;
  /**
   * Archive gate (req 06.4b AC c): all conflicts must be resolved before any
   * of the conflicting changes can archive. True iff `conflicts` is empty.
   */
  canArchive: boolean;
}
