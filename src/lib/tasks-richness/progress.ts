/**
 * Task 4.1 — Progress + due-date helpers (req 04 §4.16, 4.17, 4.20).
 *
 * Pure helpers over the {@link RichTask} model:
 *  - sub-checklist progress (done / total / ratio)
 *  - per-change (or per-grouping) progress rollup
 *  - due-date predicates: `isOverdue`, `isDueThisWeek`
 *
 * All dates are compared in UTC; the server stores UTC (§4.17a). The
 * `now` argument is injected so tests are deterministic; UI callers pass
 * `new Date()`.
 */
import type { RichTask } from "./types";

/** Progress counter: done tasks vs total tasks. */
export interface ProgressCount {
  done: number;
  total: number;
  /** ratio in [0, 1]; 0 when total is 0 (prevents division by zero). */
  ratio: number;
}

/** Per-group progress rollup + overall aggregate. */
export interface ProgressRollup {
  byKey: Map<string, ProgressCount>;
  overall: ProgressCount;
}

/** Sub-checklist progress for a single task (§4.16). */
export function subChecklistProgress(t: RichTask): ProgressCount {
  const total = t.subChecklist.length;
  const done = t.subChecklist.filter((s) => s.done).length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}

/**
 * Roll up progress over `tasks` by a grouping dimension.
 *   - "change" → per-change rollup (the §4.20a contract)
 *   - "project" → single bucket, same shape (for the project overview)
 */
export function rollupProgress(
  tasks: RichTask[],
  _dimension: "change" | "project",
): ProgressRollup {
  const byKey = new Map<string, ProgressCount>();
  for (const t of tasks) {
    const key = t.changeId;
    const prev = byKey.get(key) ?? { done: 0, total: 0, ratio: 0 };
    prev.total += 1;
    if (t.checked === true || t.status === "done") prev.done += 1;
    prev.ratio = prev.total === 0 ? 0 : prev.done / prev.total;
    byKey.set(key, prev);
  }
  let doneTotal = 0, doneDone = 0;
  for (const c of byKey.values()) {
    doneTotal += c.total;
    doneDone += c.done;
  }
  return {
    byKey,
    overall: { done: doneDone, total: doneTotal, ratio: doneTotal === 0 ? 0 : doneDone / doneTotal },
  };
}

/** True iff task has a due date, is not completed, and due date < now (§4.17). */
export function isOverdue(t: RichTask, now: Date = new Date()): boolean {
  if (t.dueDate === null) return false;
  if (t.checked === true || t.status === "done") return false;
  return new Date(t.dueDate).getTime() < now.getTime();
}

/** True iff task is due within the next 7 days (not yet completed, not overdue). */
export function isDueThisWeek(t: RichTask, now: Date = new Date()): boolean {
  if (t.dueDate === null) return false;
  if (t.checked === true || t.status === "done") return false;
  const due = new Date(t.dueDate).getTime();
  const weekFromNow = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return due >= now.getTime() && due <= weekFromNow;
}
