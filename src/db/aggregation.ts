import { db } from "@/db";
import { changes, tasks } from "@/db/schema";
import { count, ne } from "drizzle-orm";

/**
 * Cross-project aggregation queries for the collective dashboard
 * (OpenSpec change `multi-project-collective-dashboard`, task 2.2).
 *
 * Per design D-MPCD-2 the collective `/` is built from aggregation queries
 * computed at read time over the existing per-project tables (`changes`,
 * `tasks`). These helpers are index-backed `count` queries scoped across ALL
 * enrolled projects (no per-project filter) so the collective overview can be
 * rendered with a single `Promise.all`.
 *
 * Semantics (aligned to the spec wording "in flight (non-archived)"):
 *   - in-flight change  ⟺ `changes.status != "archived"`
 *   - open task         ⟺ `tasks.status   != "done"`
 */

/** Count of in-flight (non-archived) changes across all enrolled projects. */
export async function countInFlightChanges(): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(changes)
    .where(ne(changes.status, "archived"));
  return Number(rows[0]?.count ?? 0);
}

/** Count of open (non-done) tasks across all enrolled projects. */
export async function countOpenTasks(): Promise<number> {
  const rows = await db
    .select({ count: count() })
    .from(tasks)
    .where(ne(tasks.status, "done"));
  return Number(rows[0]?.count ?? 0);
}

export interface CollectiveAggregate {
  /** Total number of enrolled projects. */
  projectCount: number;
  /** Total in-flight (non-archived) changes across all projects. */
  inFlightChanges: number;
  /** Total open (non-done) tasks across all projects. */
  openTasks: number;
}

/**
 * Build the full cross-project aggregate triple for the collective dashboard.
 *
 * `projectCount` is supplied by the caller (the page already loads all
 * projects for the per-project cards, so we reuse that count rather than
 * re-querying). The change/task counts are index-backed counts over the whole
 * table.
 */
export async function countCrossProjectAggregates({
  projectCount,
}: {
  projectCount: number;
}): Promise<CollectiveAggregate> {
  const [inFlightChanges, openTasks] = await Promise.all([
    countInFlightChanges(),
    countOpenTasks(),
  ]);
  return { projectCount, inFlightChanges, openTasks };
}
