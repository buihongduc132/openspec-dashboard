import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { computeVelocity, type VelocityOptions, type VelocitySeries } from "@/lib/dashboard-analytics/velocity";

/**
 * Audit-log backed analytics (task 2.22 — req 7.3 activity timeline +
 * req 7.5 task velocity).
 *
 * These helpers read the per-project `audit_logs` table (Phase 0 hash-chain
 * audit log). They are index-backed project-scoped queries; the pure
 * behavioural logic (deep-link mapping, bucket math) lives in
 * `@/lib/dashboard-analytics`.
 */

/** A raw audit-log event projected into the shape the timeline consumes. */
export interface ActivityEventRow {
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  author: string | null;
  createdAt: Date;
}

export interface TimelineFilter {
  /** Restrict to a set of audit actions (e.g. `["task.completed"]`). */
  actionTypes?: string[];
  /** Restrict to a set of actors (audit `author`). */
  actors?: string[];
  /** Restrict to a set of change ids (audit `entityId` for change entities). */
  changeIds?: string[];
  /** Cap the number of returned events. Defaults to 50. */
  limit?: number;
}

/**
 * Chronological (newest-first) audit-log feed for a project (req 7.3).
 * Supports filtering by event type, actor, and change (AC 7.3b).
 */
export async function getProjectActivityTimeline(
  projectId: string,
  filter: TimelineFilter = {}
): Promise<ActivityEventRow[]> {
  const conditions = [eq(auditLogs.projectId, projectId)];
  if (filter.actionTypes?.length) {
    conditions.push(inArray(auditLogs.action, filter.actionTypes));
  }
  if (filter.actors?.length) {
    conditions.push(inArray(auditLogs.author, filter.actors));
  }
  if (filter.changeIds?.length) {
    conditions.push(inArray(auditLogs.entityId, filter.changeIds));
  }

  return db
    .select({
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      details: auditLogs.details,
      author: auditLogs.author,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(asc(auditLogs.createdAt))
    .limit(filter.limit ?? 50);
}

/**
 * Task velocity for a project (req 7.5). Pulls audit-log task-completion
 * events (req 7.5a) and buckets them over a configurable window (req 7.5b).
 */
export async function getProjectVelocity(
  projectId: string,
  options: VelocityOptions
): Promise<VelocitySeries> {
  const completions = await getProjectVelocityCompletions(projectId);
  return computeVelocity(completions, options);
}

/**
 * Raw task-completion timestamps for a project (req 7.5a). Exposed so the
 * client-side velocity chart can re-bucket interactively without a DB hit
 * when the window changes.
 */
export async function getProjectVelocityCompletions(
  projectId: string
): Promise<Date[]> {
  const rows = await db
    .select({ createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.projectId, projectId),
        eq(auditLogs.action, "task.completed")
      )
    )
    .orderBy(asc(auditLogs.createdAt));

  return rows.map((r) => r.createdAt);
}
