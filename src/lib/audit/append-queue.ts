/**
 * Task 5.4 (GREEN) — Per-project single-writer append queue for the audit log.
 *
 * Spec source:
 *   `openspec/changes/phase0-foundations/specs/audit-chain/spec.md`,
 *   Requirement "Single-writer append queue per project"; design D0-3.
 *
 * Each project has one audit file (under the sidecar location). Appends go
 * through a per-project async mutex (a serialized promise chain) so no two
 * concurrent appends read the same `prevHash`. The hash is computed BEFORE the
 * append, and the append is a single line write (newline-delimited JSON of the
 * chained entry). On restart (a fresh queue instance) the last persisted hash
 * is re-read from the file as the chain head.
 *
 * The filesystem surface is injected (`AppendQueueFs`) so the mutex +
 * restart-recovery logic is unit-testable without touching a real disk
 * (mirrors the projection layer's fake-FS test pattern).
 */
import { dirname } from "node:path";
import {
  GENESIS_HASH,
  recomputeHash,
  type ChainEntry,
  type EntryBody,
} from "./chain";

/**
 * Injectable filesystem surface. The real implementation is backed by
 * `node:fs/promises`; tests supply an in-memory fake. `readFile` MUST throw
 * with `code === "ENOENT"` for a missing file (matching `node:fs/promises`).
 */
export interface AppendQueueFs {
  mkdir(dir: string): Promise<void>;
  /** Read the full file contents. Throw ENOENT-style when absent. */
  readFile(path: string): Promise<string>;
  /** Append `data` to the file in a single write (newline-delimited log). */
  appendFile(path: string, data: string): Promise<void>;
}

/** Resolves a projectId to its audit-file path. */
export type AuditPathResolver = (projectId: string) => string;

export interface AuditAppendQueue {
  /**
   * Append `body` to `projectId`'s audit log. Serialized per project so the
   * returned entry's `prevHash` is never stale. Creates the audit file
   * (chained from genesis) on first use.
   */
  append(projectId: string, body: EntryBody): Promise<ChainEntry>;
  /** The hash of the last persisted entry for `projectId` (genesis if empty). */
  headHash(projectId: string): Promise<string>;
}

/**
 * Build a per-project single-writer audit append queue backed by `fs`.
 *
 * `pathResolver(projectId)` maps a project to its audit log file. The queue
 * keeps an in-process per-project serialized promise chain (the mutex) plus a
 * per-project cached head hash; the cache is cold on construction so a fresh
 * instance (e.g. after process restart) re-reads the persisted head before its
 * first append — exactly the D0-3 restart-recovery contract.
 */
export function createAppendQueue(
  fs: AppendQueueFs,
  pathResolver: AuditPathResolver,
): AuditAppendQueue {
  // Per-project serialized promise chain (the mutex). Each append chains onto
  // the previous tail so no two appends for the same project run concurrently.
  const tails = new Map<string, Promise<unknown>>();
  // Per-project cached head hash. Cold on construction (restart re-reads file).
  const headCache = new Map<string, string>();

  async function readHeadHash(projectId: string): Promise<string> {
    const cached = headCache.get(projectId);
    if (cached !== undefined) {
      return cached;
    }
    const path = pathResolver(projectId);
    let contents: string;
    try {
      contents = await fs.readFile(path);
    } catch (err) {
      if (isEnoent(err)) {
        return GENESIS_HASH;
      }
      throw err;
    }
    const head = lastLineHash(contents);
    headCache.set(projectId, head);
    return head;
  }

  function runSerialized<T>(
    projectId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const tail = tails.get(projectId) ?? Promise.resolve();
    // Chain `fn` after the current tail. The tail we store swallows rejections
    // so one failed append never poisons the mutex for subsequent appends; the
    // caller still observes the rejection via `result`.
    const result = tail.then(fn, fn);
    tails.set(
      projectId,
      result.then(
        () => undefined,
        () => undefined,
      ),
    );
    return result;
  }

  return {
    async append(projectId, body) {
      return runSerialized(projectId, async () => {
        const path = pathResolver(projectId);
        await fs.mkdir(dirname(path));
        const prevHash = await readHeadHash(projectId);
        const hash = recomputeHash(prevHash, body);
        const entry: ChainEntry = { body, prevHash, hash };
        // One line per entry, newline-terminated, single append write (D0-3).
        await fs.appendFile(path, `${JSON.stringify(entry)}\n`);
        headCache.set(projectId, hash);
        return entry;
      });
    },

    async headHash(projectId) {
      return runSerialized(projectId, () => readHeadHash(projectId));
    },
  };
}

/** True when `err` is a Node ENOENT (missing file). */
function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

/**
 * Parse the newline-delimited audit log and return the hash of its last
 * non-blank line. Returns GENESIS_HASH for an empty/blank file.
 */
function lastLineHash(contents: string): string {
  const lines = contents.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return GENESIS_HASH;
  }
  const last = JSON.parse(lines[lines.length - 1]) as ChainEntry;
  return last.hash;
}
