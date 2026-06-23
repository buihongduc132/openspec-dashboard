/**
 * Task 4.5 — projection orchestrator.
 *
 * `projectProject(projectId, db)` is the top-level entry point that ties the
 * scanner (task 4.2) → parse-runner (task 4.3) → upsert layer (task 4.4)
 * together for one project, and then writes the projection status fields
 * (`projected`, `lastProjectedAt`, `projectionError`) onto the `projects` row.
 *
 * Behaviour (content-projection spec):
 *  - Local project whose `rootPath` exists and is a directory → walk the
 *    openspec tree, upsert parsed artifacts, set `projected=true` and
 *    `lastProjectedAt=now`. Parse issues are collected (never thrown, design
 *    D5) and serialized into `projects.projectionError` as JSON; a clean run
 *    clears `projectionError` to `null`.
 *  - Project whose `rootPath` does not exist (or has no `openspec/` tree) →
 *    record the skip reason as plain text on `projects.projectionError`, set
 *    `projected=false`, and do NOT throw.
 *  - Remote-git projects are out of scope here (the queue/endpoint layer
 *    rejects them before calling this); if invoked, they are treated as a
 *    skip with an explicit reason.
 *
 * This module owns no global state and is safe to call from a worker, the
 * manual re-project endpoint, the watcher, or the startup sweep.
 */
import { and, eq } from "drizzle-orm";
import { projects } from "@/db/schema";
import { scanProjectTree } from "@/lib/projection/scanner";
import { runParsers, readFileSyncUtf8 } from "@/lib/projection/parse-runner";
import { upsertProjectContent } from "@/lib/projection/upsert";
import type { ProjectionDb } from "@/lib/projection/upsert";
import { startWatch, isWatching } from "@/lib/projection/watcher";
import type { ParseIssue } from "@/lib/openspec-parser/types";

/** A single parse error surfaced to the UI / status endpoint. */
export interface ProjectionParseError {
  /** Path of the offending file (relative to the project root when known). */
  file: string;
  /** 1-based line number when known. */
  line?: number;
  severity: "warn" | "error";
  kind: string;
  message: string;
}

/** Result of one projection run. */
export interface ProjectProjectionResult {
  projectId: string;
  projected: boolean;
  lastProjectedAt: Date | null;
  /** Parse issues normalized for the UI; empty on a clean run. */
  parseErrors: ProjectionParseError[];
  /** Truthy only when the run was skipped (e.g. missing rootPath). */
  skippedReason?: string;
}

/**
 * Run a full projection pass for one project. Never throws — failures are
 * recorded onto the project row and returned via {@link ProjectProjectionResult}.
 */
export async function projectProject(
  projectId: string,
  db: ProjectionDb,
): Promise<ProjectProjectionResult> {
  // 1. Load the project row (rootPath + enrollmentSource).
  const [project] = await db
    .select({
      id: projects.id,
      rootPath: projects.rootPath,
      enrollmentSource: projects.enrollmentSource,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    // No project row — nothing to project. Report as a skip rather than throw.
    return {
      projectId,
      projected: false,
      lastProjectedAt: null,
      parseErrors: [],
      skippedReason: `project "${projectId}" not found`,
    };
  }

  // Remote-git projects are not projected until git integration lands.
  if (project.enrollmentSource === "remote-git") {
    return recordSkip(
      db,
      projectId,
      `remote-git project "${projectId}" is not projected until git integration lands`,
    );
  }

  // 2. Scan the openspec tree.
  const scan = scanProjectTree(project.rootPath);
  if (!scan.ok) {
    return recordSkip(db, projectId, scan.reason);
  }

  // 3. Parse every file (issues collected, never thrown).
  const parsed = runParsers(scan, readFileSyncUtf8);

  // 4. Upsert into the DB (idempotent + incremental via content-hash).
  await upsertProjectContent(db, projectId, parsed.files);

  // 5. Normalize parse issues for storage + UI.
  const parseErrors = parsed.issues.map(toProjectionParseError);

  // 6. Write status fields. Empty parseErrors → null projectionError (clean).
  const now = new Date();
  const projectionErrorBlob =
    parseErrors.length > 0 ? JSON.stringify(parseErrors) : null;

  await db
    .update(projects)
    .set({
      projected: true,
      lastProjectedAt: now,
      projectionError: projectionErrorBlob,
      updatedAt: now,
    })
    .where(and(eq(projects.id, projectId)));

  // 7. Auto-start the chokidar watcher for this local project (task 8.3 /
  //  content-projection spec: "started the first time a local project is
  //  projected"). Idempotent — startWatch no-ops when already registered. The
  //  onEvent callback re-enqueues a projection on debounced file change. The
  //  queue is dynamically imported to avoid a project ↔ queue-instance cycle.
  ensureWatcher(projectId, project.rootPath);

  return {
    projectId,
    projected: true,
    lastProjectedAt: now,
    parseErrors,
  };
}

/**
 * Start watching the project's openspec tree if not already watched. The
 * debounced file-event callback enqueues a fresh projection via the
 * process-wide queue. Failures to start the watcher are non-fatal (logged) —
 * the projection itself already succeeded; the watcher is a freshness optimization.
 */
function ensureWatcher(projectId: string, rootPath: string): void {
  if (isWatching(projectId)) return;
  try {
    startWatch(
      projectId,
      rootPath,
      (id) => {
        // Dynamic import breaks the project → queue-instance → project cycle.
        void import("@/lib/projection/queue-instance")
          .then(({ getProjectionQueue }) => getProjectionQueue().enqueue(id))
          .catch((err) => {
            console.warn(
              `projectProject: watcher onEvent enqueue failed for "${id}" —`,
              err,
            );
          });
      },
    );
  } catch (err) {
    console.warn(
      `projectProject: failed to start watcher for "${projectId}" —`,
      err,
    );
  }
}

/** Persist a skip (projected=false) + reason, then return a skip result. */
async function recordSkip(
  db: ProjectionDb,
  projectId: string,
  reason: string,
): Promise<ProjectProjectionResult> {
  const now = new Date();
  await db
    .update(projects)
    .set({
      projected: false,
      projectionError: reason,
      updatedAt: now,
    })
    .where(and(eq(projects.id, projectId)));

  return {
    projectId,
    projected: false,
    lastProjectedAt: null,
    parseErrors: [],
    skippedReason: reason,
  };
}

/** Convert a raw parser issue into the UI-facing shape. */
function toProjectionParseError(issue: ParseIssue): ProjectionParseError {
  const out: ProjectionParseError = {
    file: issue.file,
    severity: issue.severity,
    kind: issue.kind,
    message: issue.message,
  };
  if (typeof issue.line === "number") out.line = issue.line;
  return out;
}
