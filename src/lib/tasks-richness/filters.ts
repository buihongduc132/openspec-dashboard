/**
 * Task 4.1 — Composable task filters (req 04 §4.9).
 *
 * Filters compose (AND). Multi-value filters (change, assignee, label,
 * priority) match if the task satisfies ANY value in that dimension
 * (intra-dimension OR); dimensions combine with AND. Free-text is handled
 * by {@link searchTasks} (§4.10). `activeFilterCount` drives the active-filter
 * badge on the filter button (§4.9a).
 */
import type { RichTask } from "./types";

/** Completion-status filter. */
export type CompletionFilter = "open" | "done" | "all";

/** A composable filter set; every present dimension is AND-combined. */
export interface TaskFilter {
  changeIds?: string[];
  assignees?: string[];
  labels?: string[];
  priorities?: string[];
  completion?: CompletionFilter;
  /** Inclusive `YYYY-MM-DD` bounds (compared against the date part of dueDate). */
  dueFrom?: string;
  dueTo?: string;
  /** Free-text; resolved via {@link searchTasks} but exposed here for counts. */
  text?: string;
}

/**
 * Apply `filter` to `tasks` (AND across dimensions, OR within a dimension).
 * An absent/empty dimension passes everything.
 */
export function applyFilters(tasks: RichTask[], filter: TaskFilter): RichTask[] {
  return tasks.filter((t) => matches(t, filter));
}

/** True iff task passes every present dimension of `filter`. */
export function matches(t: RichTask, f: TaskFilter): boolean {
  if (f.changeIds && f.changeIds.length > 0 && !f.changeIds.includes(t.changeId)) return false;
  if (f.assignees && f.assignees.length > 0 && !intersects(t.assignees, f.assignees)) return false;
  if (f.labels && f.labels.length > 0 && !intersects(t.labels, f.labels)) return false;
  if (f.priorities && f.priorities.length > 0 && (t.priority === null || !f.priorities.includes(t.priority))) {
    return false;
  }
  if (f.completion && f.completion !== "all") {
    const done = t.checked === true || t.status === "done";
    if (f.completion === "done" && !done) return false;
    if (f.completion === "open" && done) return false;
  }
  if ((f.dueFrom || f.dueTo) && !inDueRange(t.dueDate, f.dueFrom, f.dueTo)) return false;
  return true;
}

/** Count distinct active filter dimensions (drives the badge, §4.9a). */
export function activeFilterCount(f: TaskFilter): number {
  let n = 0;
  if (f.changeIds && f.changeIds.length > 0) n += 1;
  if (f.assignees && f.assignees.length > 0) n += 1;
  if (f.labels && f.labels.length > 0) n += 1;
  if (f.priorities && f.priorities.length > 0) n += 1;
  if (f.completion && f.completion !== "all") n += 1;
  if (f.dueFrom || f.dueTo) n += 1;
  if (f.text && f.text.trim().length > 0) n += 1;
  return n;
}

function intersects(a: string[], b: string[]): boolean {
  for (const x of a) if (b.includes(x)) return true;
  return false;
}

function inDueRange(due: string | null, from: string | undefined, to: string | undefined): boolean {
  if (due === null) return false;
  const day = due.slice(0, 10); // date part, timezone-agnostic per the contract
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
