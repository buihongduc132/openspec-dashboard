/**
 * Task 4.1 — Bulk operations, atomic per change folder (req 04 §4.23, §4.11d).
 *
 * Bulk move / assign / label / complete / delete. Bulk-ops are atomic
 * WITHIN a single change (all-or-nothing); ops spanning multiple changes
 * run as N independent per-change transactions, with a per-change result
 * report. Partial failure leaves completed changes committed and failed
 * changes rolled back — modelled here as a pure, injectable operation
 * the route layer wraps in DB transactions.
 */
import type { RichTask, TaskStatus } from "./types";

/** Union of supported bulk operations. */
export type BulkOperation =
  | { type: "move"; taskIds: string[]; status: TaskStatus }
  | { type: "assign"; taskIds: string[]; assignees: string[] }
  | { type: "label"; taskIds: string[]; labels: string[] }
  | { type: "complete"; taskIds: string[]; value: boolean }
  | { type: "delete"; taskIds: string[] };

/** Per-task outcome. */
export interface BulkTaskResult {
  taskId: string;
  ok: boolean;
  error?: string;
}

/** Per-change transaction outcome (§4.11d / §4.23b atomicity). */
export interface BulkChangeResult {
  changeId: string;
  ok: boolean;
  appliedTaskIds: string[];
}

/** Aggregate bulk result. */
export interface BulkResult {
  /** Updated task set (deleted tasks removed). */
  updated: RichTask[];
  results: BulkTaskResult[];
  perChange: BulkChangeResult[];
}

/**
 * Apply a bulk operation. Tasks not present in the set are reported as
 * failures (never silently dropped). Each change folder is its own
 * transaction: a change commits only if every selected task in it succeeds.
 */
export function applyBulkOperation(tasks: RichTask[], op: BulkOperation): BulkResult {
  const ids = new Set(op.taskIds);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Group selected task ids by change folder (transaction boundary).
  const byChange = new Map<string, string[]>();
  for (const id of op.taskIds) {
    const t = byId.get(id);
    const changeId = t?.changeId ?? "__unknown__";
    const list = byChange.get(changeId) ?? [];
    list.push(id);
    byChange.set(changeId, list);
  }

  const results: BulkTaskResult[] = [];
  const perChange: BulkChangeResult[] = [];
  const survivors: RichTask[] = [];

  for (const [changeId, changeTaskIds] of byChange) {
    // A change "transaction" succeeds iff every selected task in it resolves.
    const txResults: BulkTaskResult[] = changeTaskIds.map((taskId) => {
      const t = byId.get(taskId);
      if (!t) {
        return { taskId, ok: false, error: "task not found" };
      }
      return { taskId, ok: true };
    });
    const txOk = txResults.every((r) => r.ok);

    if (txOk) {
      for (const taskId of changeTaskIds) {
        const t = byId.get(taskId)!;
        const next = applyOne(t, op);
        if (next) survivors.push(next);
      }
    } else {
      // Roll back this change: keep its tasks unchanged.
      for (const taskId of changeTaskIds) {
        const t = byId.get(taskId);
        if (t) survivors.push(t);
      }
    }
    results.push(...txResults);
    perChange.push({ changeId, ok: txOk, appliedTaskIds: txOk ? changeTaskIds.slice() : [] });
  }

  // Keep unselected tasks verbatim (delete is the only op that drops rows;
  // for other ops unselected tasks are untouched).
  for (const t of tasks) {
    if (!ids.has(t.id)) survivors.push(t);
  }

  return { updated: survivors, results, perChange };
}

/** Apply a single-task mutation for the given op. Returns null for "delete". */
function applyOne(t: RichTask, op: BulkOperation): RichTask | null {
  switch (op.type) {
    case "move": {
      const checked = op.status === "done";
      return { ...t, status: op.status, checked };
    }
    case "assign":
      return { ...t, assignees: op.assignees.slice() };
    case "label": {
      const merged = new Set([...t.labels, ...op.labels]);
      return { ...t, labels: [...merged] };
    }
    case "complete":
      return {
        ...t,
        checked: op.value,
        status: op.value ? "done" : (t.status === "done" ? "in-progress" : t.status),
      };
    case "delete":
      return null;
    default: {
      // Exhaustiveness guard — priority is not a bulk op dimension here.
      const _exhaustive: never = op;
      void _exhaustive;
      return t;
    }
  }
}


