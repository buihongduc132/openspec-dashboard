/**
 * Task 1.8 — Atomic filesystem write primitive.
 *
 * Implements the "write-to-temp + rename" pattern required by
 * `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/
 * spec.md` (Requirement "Filesystem projection with atomic writes"; req 01 §1.4,
 * INV-7).
 *
 * The temp file is created in the SAME directory as the target so the final
 * `rename(2)` is atomic on POSIX (same filesystem). On any failure during the
 * temp write or the rename, the temp file is unlinked and the original target
 * is left untouched — the writer NEVER leaves a half-written file at the
 * target path.
 *
 * For unit testability the filesystem operations are injectable; production
 * callers use the default {@link nodeFs}.
 */
import { dirname, join, basename } from "node:path";
import * as fsPromises from "node:fs/promises";
import { randomUUID } from "node:crypto";

/**
 * Injectable filesystem surface used by {@link writeFileAtomic} and the
 * projection layer. Tests pass a recording fake; production passes
 * {@link nodeFs}.
 */
export interface AtomicFs {
  mkdir(dir: string, opts: { recursive: boolean }): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

/** Alias used by the projection layer (same surface). */
export type ProjectionFs = AtomicFs;

/** Default production filesystem binding. */
export const nodeFs: AtomicFs = {
  mkdir: (dir, opts) => fsPromises.mkdir(dir, opts).then(() => undefined),
  writeFile: (path, data) => fsPromises.writeFile(path, data, "utf8"),
  rename: (from, to) => fsPromises.rename(from, to),
  unlink: (path) => fsPromises.unlink(path),
};

/**
 * Atomically write `content` to `filePath` via a sibling temp file + rename.
 *
 * Guarantees (INV-7):
 *  - On success: `filePath` holds `content` and no temp file remains.
 *  - On failure: `filePath` is untouched (pre-existing content preserved) and
 *    the temp file is cleaned up.
 */
export async function writeFileAtomic(
  filePath: string,
  content: string,
  fs: AtomicFs = nodeFs,
): Promise<void> {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Hidden (dot-prefixed) temp file with a random suffix to avoid collisions
  // between concurrent writers of the same target.
  const tmp = join(dir, `.${basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await fs.writeFile(tmp, content);
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup; ignore "not found" because another writer may have
    // already removed it or the write may never have completed.
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }
}
