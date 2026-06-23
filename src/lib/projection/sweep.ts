/**
 * Task 8.1 — startup stale-projection sweep.
 *
 * Implements the content-projection spec's "On startup the system SHALL sweep
 * stale projections" requirement. `sweepStaleProjects()` selects every local
 * project and enqueues an incremental projection for any that are stale,
 * WITHOUT blocking request handling (it is fire-and-forget at the call site).
 *
 * A project is stale when EITHER:
 *   - `projected` is false (never projected, or the last attempt failed); OR
 *   - `lastProjectedAt` is older than the newest file mtime under
 *     `<rootPath>/openspec/` (something changed on disk since the last run).
 *
 * Remote-git projects are skipped (no projection until git integration lands),
 * and projects whose rootPath is missing are skipped rather than enqueued.
 *
 * The newest-mtime computation is injected so the sweep stays unit-testable
 * (the production reader walks the openspec tree; tests supply a stub).
 */
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getProjectionQueue } from "@/lib/projection/queue-instance";

/** Injectable newest-mtime resolver: returns ms-since-epoch of the newest file. */
export type NewestMtimeResolver = (rootPath: string) => Promise<number | null>;

/** Options for {@link sweepStaleProjects}. */
export interface SweepOptions {
  newestMtime?: NewestMtimeResolver;
}

/**
 * Walk every local project, enqueue a projection for each stale one, and
 * return the project ids that were enqueued. Never throws — failures
 * resolving mtimes / enqueueing are caught per-project so one bad root cannot
 * abort the sweep.
 */
export async function sweepStaleProjects(
  options: SweepOptions = {},
): Promise<string[]> {
  const newestMtime = options.newestMtime ?? defaultNewestMtime;
  const queue = getProjectionQueue();

  const allProjects = await db.select().from(projects);
  const enqueued: string[] = [];

  for (const project of allProjects) {
    try {
      if (project.enrollmentSource !== "local") continue;

      if (!project.projected) {
        const result = await queue.enqueue(project.id);
        enqueued.push(result.projectId);
        continue;
      }

      // projected=true — check whether disk moved ahead of the last run.
      if (!project.lastProjectedAt) {
        const result = await queue.enqueue(project.id);
        enqueued.push(result.projectId);
        continue;
      }

      const newest = await newestMtime(project.rootPath);
      if (newest != null && newest > project.lastProjectedAt.getTime()) {
        const result = await queue.enqueue(project.id);
        enqueued.push(result.projectId);
      }
    } catch (err) {
      // One bad project must not abort the sweep.
      console.warn(
        `sweepStaleProjects: project "${project.id}" skipped —`,
        err,
      );
    }
  }

  return enqueued;
}

/**
 * Default newest-mtime resolver: the newest mtime of any regular file under
 * `<rootPath>/openspec/`. Returns `null` when the tree is absent/empty. The
 * walk is bounded by the openspec subtree only, so unrelated repo churn does
 * not spuriously trip the sweep.
 */
export const defaultNewestMtime: NewestMtimeResolver = async (
  rootPath,
): Promise<number | null> => {
  const { existsSync, readdirSync, statSync } = await import("node:fs");
  const path = await import("node:path");

  const openspecDir = path.join(rootPath, "openspec");
  if (!existsSync(openspecDir) || !statSync(openspecDir).isDirectory()) {
    return null;
  }

  let newest = 0;
  const stack = [openspecDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile()) {
        const mtime = st.mtimeMs;
        if (mtime > newest) newest = mtime;
      }
    }
  }
  return newest > 0 ? newest : null;
};
