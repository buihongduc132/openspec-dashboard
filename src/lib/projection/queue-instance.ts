/**
 * Process-wide projection queue singleton (design D4).
 *
 * The HTTP route, watcher, and startup sweep all share ONE in-memory queue per
 * project so concurrent `enqueue(projectId)` calls coalesce into a single
 * in-flight job (content-projection spec: "Manual re-project endpoint SHALL
 * be non-blocking"). The queue is constructed lazily on first access and bound
 * to the real {@link projectProject} worker via {@link db}.
 */
import { db } from "@/db";
import { createProjectionQueue } from "@/lib/projection/queue";
import { projectProject } from "@/lib/projection/project";
import type { ProjectionQueue } from "@/lib/projection/queue";
import type { ProjectionDb } from "@/lib/projection/upsert";
import * as schema from "@/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@/db";

let singleton: ProjectionQueue | null = null;

/**
 * Return the process-wide projection queue, constructing it on first call.
 * The worker is `projectProject(projectId, db)`, which never throws (failures
 * are recorded onto the project row as `projectionError`).
 */
export function getProjectionQueue(): ProjectionQueue {
  if (singleton) return singleton;
  // `db` from `@/db` is created without a schema binding, so re-bind it with
  // the full schema for the typed projection surface (purely a type-level
  // narrowing — the underlying pool is the same).
  const projectionDb = drizzle(pool, { schema }) as unknown as ProjectionDb;
  singleton = createProjectionQueue((projectId) => projectProject(projectId, projectionDb));
  return singleton;
}

/**
 * Replace the process-wide queue (test helper). The next `getProjectionQueue()`
 * call returns a fresh queue bound to the real worker.
 */
export function resetProjectionQueue(): void {
  singleton = null;
}
