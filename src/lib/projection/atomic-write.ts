/**
 * Task 4.6 (GREEN) — projection-aware atomic write.
 *
 * Implements the filesystem-projection spec requirement "Atomic server-side
 * writes (server → disk)":
 *
 *   "Every server-side mutation SHALL write the corresponding canonical
 *    file(s) atomically (write-temp + rename). A write failure SHALL roll
 *    back the in-memory projection and return a 5xx describing the partial
 *    state."
 *
 * This module wraps the lower-level temp+rename primitive
 * (`writeFileAtomic`, Task 1.8) with the projection-level concerns:
 *
 *  - On success: optionally invoke a caller-supplied `commit` hook to advance
 *    the in-memory projection to the freshly-durable bytes.
 *  - On failure (temp-write OR rename): invoke the caller-supplied `rollback`
 *    hook exactly once so the projection never holds bytes that never reached
 *    disk, and throw a {@link ProjectionWriteError} whose HTTP status is a 5xx
 *    and whose `partialState` describes the unflushed file + last-good
 *    on-disk content.
 *
 * Why a separate module from Task 1.8's primitive: the primitive owns the
 * write-temp+rename mechanics and the temp-cleanup; this module owns the
 * projection↔disk consistency contract (rollback + 5xx shape) that the
 * mutating-endpoint layer (ETag middleware, audit emission) needs to surface
 * a faithful error to the client.
 *
 * The filesystem surface is injectable (default {@link projectionNodeFs}) so
 * the rollback + 5xx contract is unit-testable without real I/O.
 */
import { mkdir, writeFile as fsWriteFile, rename as fsRename, unlink as fsUnlink, readFile as fsReadFile } from "node:fs/promises";
import type { AtomicFs } from "@/lib/filesystem-projection";
import { writeFileAtomic } from "@/lib/filesystem-projection/atomic-write";

/**
 * Filesystem surface required by {@link commitAtomicWrite}: the temp+rename
 * primitive's {@link AtomicFs} plus a `readFile` to snapshot the last-good
 * on-disk content for the partial-state description.
 */
export interface ProjectionAtomicFs extends AtomicFs {
  /** Read a file's current content, or return `null` if it does not exist. */
  readFile(path: string): Promise<string | null>;
}

/** Default production filesystem binding. */
export const projectionNodeFs: ProjectionAtomicFs = {
  mkdir: (dir, opts) => mkdir(dir, opts).then(() => undefined),
  writeFile: (path, data) => fsWriteFile(path, data, "utf8"),
  rename: (from, to) => fsRename(from, to),
  unlink: (path) => fsUnlink(path),
  async readFile(path) {
    try {
      return await fsReadFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
};

/**
 * Hook invoked by {@link commitAtomicWrite} to restore the in-memory
 * projection to its pre-write state. Called EXACTLY ONCE, only when the
 * durable write (temp-write or rename) failed. Must be idempotent so that a
 * retry after a transient failure does not double-rewind.
 */
export type ProjectionRollback = () => void | Promise<void>;

/**
 * Hook invoked by {@link commitAtomicWrite} AFTER the file has been durably
 * renamed into place, to advance the in-memory projection to the new bytes.
 * Called at most once, only on success. If it throws, the durable write is
 * NOT rolled back (it is on disk) but the error propagates to the caller —
 * the projection is then known-stale and the caller must reconcile.
 */
export type ProjectionCommit = () => void | Promise<void>;

/** Options for {@link commitAtomicWrite}. */
export interface AtomicProjectionWriteOptions {
  /** Canonical file path to write (under the registered project root). */
  filePath: string;
  /** New full canonical content of the file. */
  content: string;
  /**
   * Restore the in-memory projection to its pre-write state on a write
   * failure. REQUIRED: a mutation that cannot persist MUST NOT leave the
   * projection holding bytes that are not on disk.
   */
  rollback: ProjectionRollback;
  /**
   * Optional hook to advance the projection after a durable rename. If
   * omitted, the projection is assumed to be advanced by the caller (e.g. the
   * watcher's self-write marker + re-parse path).
   */
  commit?: ProjectionCommit;
  /** Injectable filesystem (tests pass a fake; prod uses {@link projectionNodeFs}). */
  fs?: ProjectionAtomicFs;
}

/**
 * Description of the partial state attached to a {@link ProjectionWriteError}.
 *
 * `filePath` is the canonical target that failed to flush; `lastGoodContent`
 * is what is actually on disk at that path (or `null` when the file did not
 * exist before the failed write), so the operator / UI knows what the
 * projection was rewound to.
 */
export interface ProjectionPartialState {
  filePath: string;
  lastGoodContent: string | null;
}

/**
 * Error thrown by {@link commitAtomicWrite} when the durable write fails.
 *
 * Carries a 5xx HTTP status (default 503 — "could not persist") and a
 * structured `partialState` so the mutating-endpoint layer can surface a
 * faithful 5xx to the client per the spec scenario "Write failure rolls back
 * projection".
 */
export class ProjectionWriteError extends Error {
  /** HTTP status — always a 5xx. */
  readonly statusCode: number;
  /** Description of the unflushed partial state for the client/UI. */
  readonly partialState: ProjectionPartialState;
  /** The underlying I/O error that caused the flush to fail, if any. */
  readonly cause?: Error;

  constructor(partialState: ProjectionPartialState, cause?: unknown) {
    super(
      `Atomic projection write failed for "${partialState.filePath}". ` +
        `Projection rolled back to last-good on-disk content. ` +
        (cause instanceof Error ? `Underlying error: ${cause.message}` : ""),
    );
    this.name = "ProjectionWriteError";
    this.statusCode = 503;
    this.partialState = partialState;
    if (cause instanceof Error) this.cause = cause;
  }
}

/**
 * Commit a canonical mutation atomically, keeping the in-memory projection
 * consistent with disk.
 *
 * Contract:
 *  - On success: `filePath` holds `content` (durable via temp+rename), the
 *    temp file is gone, and `commit` (if provided) has been invoked.
 *    `rollback` is NOT invoked.
 *  - On failure: `rollback` is invoked EXACTLY ONCE, `filePath` is left at
 *    its pre-write on-disk content (untouched), no temp file remains, and a
 *    {@link ProjectionWriteError} (5xx) is thrown describing the partial state.
 */
export async function commitAtomicWrite(
  opts: AtomicProjectionWriteOptions,
): Promise<void> {
  const { filePath, content, rollback, commit, fs } = opts;

  // Capture the last-good on-disk content BEFORE attempting the write, so the
  // partial-state description is accurate regardless of which step failed.
  const io = fs ?? projectionNodeFs;
  let lastGoodContent: string | null;
  try {
    lastGoodContent = await io.readFile(filePath);
  } catch {
    // If we cannot even read the current content, treat it as unknown so the
    // operator is told the projection was rewound to an indeterminate state.
    lastGoodContent = null;
  }

  try {
    await writeFileAtomic(filePath, content, io);
  } catch (err) {
    // Durable write failed: rewind the projection exactly once, then surface
    // a faithful 5xx describing the unflushed partial state.
    await Promise.resolve(rollback()).catch(() => {
      // A rollback failure is swallowed here; the primary signal is the
      // write failure. The caller may detect projection staleness via the
      // watcher's next reconciliation pass.
    });
    throw new ProjectionWriteError(
      { filePath, lastGoodContent },
      err,
    );
  }

  // Durable write succeeded — advance the projection (best-effort). If the
  // commit hook throws, the bytes ARE on disk and must NOT be rolled back;
  // re-throw so the caller knows the projection is stale and can reconcile.
  if (commit) {
    await commit();
  }
}
