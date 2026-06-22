/**
 * Task 4.1 — Task dependencies (req 04 §4.12).
 *
 * `blocks` / `blocked-by` edges resolved by UUID (stable across renumbering).
 * Cycle detection rejects cycles with a clear error so the UI can surface
 * the offending chain. A task with an uncompleted blocker (a `blocked-by`
 * edge to a task that is not yet checked/done) cannot be moved into Done
 * (§4.12a).
 *
 * Both edge kinds participate in cycle detection: `A blocked-by B` and
 * `B blocks A` describe the same precedence relationship, so both are
 * normalized to a directed `blocker → blocked` adjacency for the DFS.
 */
import type { Dependency, RichTask } from "./types";

/** Returns each cycle as the list of task ids on it (≥2 ids). */
export function detectCycles(tasks: RichTask[]): string[][] {
  // Build `blocker -> blocked` adjacency from both edge kinds.
  const adj = new Map<string, Set<string>>();
  const ensure = (k: string) => {
    let s = adj.get(k);
    if (!s) {
      s = new Set();
      adj.set(k, s);
    }
    return s;
  };
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      // Normalize to blocker -> blocked.
      const { blocker, blocked } = asPrecedence(t.id, dep);
      ensure(blocker).add(blocked);
    }
  }

  const cycles: string[][] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];

  const visit = (u: string): void => {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        // Found a back-edge → cycle. Slice from the first occurrence of v.
        const start = stack.indexOf(v);
        cycles.push(stack.slice(start).concat(v));
      } else if (c === WHITE) {
        visit(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  };

  for (const k of adj.keys()) {
    if ((color.get(k) ?? WHITE) === WHITE) visit(k);
  }
  return cycles;
}

/**
 * Can `taskId` be dragged into Done? False iff it has an uncompleted
 * `blocked-by` edge (§4.12a). Dangling references (blocker task missing)
 * are treated as resolved so orphan edges don't deadlock the board.
 */
export function canMoveToDone(taskId: string, tasks: RichTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const target = byId.get(taskId);
  if (!target) return false;
  for (const dep of target.dependencies) {
    if (dep.type !== "blocked-by") continue;
    const blocker = byId.get(dep.taskId);
    if (!blocker) continue; // dangling reference → ignore
    const done = blocker.checked === true || blocker.status === "done";
    if (!done) return false;
  }
  return true;
}

/** Normalize an edge + owning task into `blocker → blocked`. */
function asPrecedence(ownerId: string, dep: Dependency): { blocker: string; blocked: string } {
  if (dep.type === "blocked-by") {
    // owner is blocked by dep.taskId → dep.taskId blocks owner.
    return { blocker: dep.taskId, blocked: ownerId };
  }
  // blocks: owner blocks dep.taskId → owner is the blocker.
  return { blocker: ownerId, blocked: dep.taskId };
}
