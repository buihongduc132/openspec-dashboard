/**
 * Task 4.1 — Swimlane grouping (req 04 §4.7).
 *
 * Horizontal swimlanes group board rows by: change, spec domain, assignee,
 * label, or priority. The swimlane + column form a 2D grid; per-cell counts
 * are reported so the UI can render density. A "No lane" (key === null)
 * fallback exists for tasks missing the grouping attribute (§4.7b).
 *
 * For multi-valued attributes (assignees, labels) a task fans out into each
 * matching lane — matching Wekan/Vikunja swimlane semantics.
 */
import type { RichTask, TaskStatus } from "./types";

/** Dimension a board can be swum by. */
export type SwimlaneDimension = "change" | "assignee" | "label" | "priority";

/** A resolved swimlane. `key === null` is the "No lane" fallback (§4.7b). */
export interface Swimlane {
  key: string | null;
  tasks: RichTask[];
  /** Per-status counts for the 2D grid (status → count). */
  counts: Partial<Record<TaskStatus, number>>;
}

/**
 * Group `tasks` into ordered swimlanes by `dimension`. Lane key order is
 * first-seen; the "No lane" (`null`) bucket is always last when present.
 */
export function groupIntoSwimlanes(
  tasks: RichTask[],
  dimension: SwimlaneDimension,
): Swimlane[] {
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, RichTask[]>();
  const has = (k: string | null) => buckets.has(k);

  const push = (k: string | null, t: RichTask) => {
    if (!has(k)) {
      buckets.set(k, []);
      order.push(k);
    }
    buckets.get(k)!.push(t);
  };

  for (const t of tasks) {
    const keys = laneKeys(t, dimension);
    if (keys.length === 0) {
      push(null, t);
    } else {
      for (const k of keys) push(k, t);
    }
  }

  // Move the null fallback to the end for stable rendering.
  if (has(null)) {
    const idx = order.indexOf(null);
    if (idx >= 0) {
      order.splice(idx, 1);
      order.push(null);
    }
  }

  return order.map((key) => {
    const laneTasks = buckets.get(key)!;
    const counts: Partial<Record<TaskStatus, number>> = {};
    for (const t of laneTasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return { key, tasks: laneTasks, counts };
  });
}

/** Resolve the (possibly multiple) lane keys for a task under a dimension. */
function laneKeys(t: RichTask, dimension: SwimlaneDimension): string[] {
  switch (dimension) {
    case "change":
      return t.changeId ? [t.changeId] : [];
    case "assignee":
      return t.assignees.slice();
    case "label":
      return t.labels.slice();
    case "priority":
      return t.priority ? [t.priority] : [];
  }
}
