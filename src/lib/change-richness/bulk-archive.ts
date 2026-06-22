/**
 * Task 4.2 / req 03.14 — Bulk archive ordering engine.
 *
 * Pure planner for bulk (multi-change) archive (req 03.14):
 *   - AC (a): conflict detection runs across the WHOLE selected set before
 *     any archive — including two changes mutating the same requirement.
 *   - AC (b): archive order is topological w.r.t. inter-change dependencies
 *     (e.g. change A ADDS a requirement that B MODIFIES → A archives first);
 *     cycles in the inter-change dependency graph are REJECTED with a clear
 *     error (user must split a change); the topo tie-break is DETERMINISTIC
 *     — lexicographic on change name — so the final main-spec state is
 *     reproducible regardless of selection order.
 *
 * Inter-change dependency rule (req 03.14 AC b):
 *   A → B  (A must archive before B) when:
 *     - A.adds ∩ (B.adds ∪ B.modifies ∪ B.removes) ≠ ∅   (A creates it, B touches it)
 *     - A.removes ∩ B.modifies ≠ ∅                       (A deletes it, B edits it — A first)
 *   Two changes both MODIFY/REMOVE the same title is a DIRECT conflict
 *   (AC a), not a recoverable ordering — surfaced as a conflict.
 *
 * The route layer composes this planner with the per-project archive mutex
 * (src/lib/changes/archive.ts `ArchiveMutex`) and the file-level conflict
 * matrix (req 06 §6.4b, task 4.3).
 */
import type {
  BulkArchiveConflict,
  BulkArchivePlan,
  BulkChangeInput,
} from "@/lib/change-richness/types";

/** Re-export for route-layer composition. */
export type { BulkChangeInput, BulkArchivePlan, BulkArchiveConflict };

/**
 * Plan a bulk archive: detect inter-change conflicts (AC a) and produce the
 * topological archive order with a deterministic lexicographic tie-break
 * (AC b). Returns `{ order: [], conflict }` when the set is unarchivable.
 */
export function planBulkArchive(changes: BulkChangeInput[]): BulkArchivePlan {
  // ── AC (a): direct conflict — two changes mutate the same title ─────────
  const conflict = detectDirectConflict(changes);
  if (conflict) return { order: [], conflict };

  // ── AC (b): inter-change dependency edges + topological order ───────────
  const edges = computeInterChangeEdges(changes);
  const { order, cycle } = topoSort(changes.map((c) => c.name), edges);

  if (cycle) {
    return {
      order: [],
      conflict: {
        cycle,
        reason:
          `Cycle detected in the inter-change dependency graph (${cycle.join(" → ")}). ` +
          "Split one of the changes so the dependency graph becomes acyclic before archiving.",
      },
    };
  }
  return { order, conflict: null };
}

/**
 * Detect a direct (unrecoverable) conflict: two changes both modify/remove
 * the same requirement, or two changes add the same requirement (AC a).
 * Returns the first conflict found, or null.
 */
function detectDirectConflict(changes: BulkChangeInput[]): BulkArchiveConflict | null {
  // adders[name] = list of change names adding that title; mutators similarly.
  const adders = new Map<string, string[]>();
  const mutators = new Map<string, string[]>(); // modify OR remove
  for (const c of changes) {
    for (const t of c.adds) push(adders, t, c.name);
    for (const t of [...c.modifies, ...c.removes]) push(mutators, t, c.name);
  }
  for (const [, names] of mutators) {
    if (names.length > 1) {
      return {
        cycle: sortedUnique(names),
        reason:
          `Conflict: changes ${fmtList(sortedUnique(names))} all mutate the same ` +
          "requirement(s). Resolve by editing the changes so each requirement is mutated by at most one.",
      };
    }
  }
  for (const [, names] of adders) {
    if (names.length > 1) {
      return {
        cycle: sortedUnique(names),
        reason:
          `Conflict: changes ${fmtList(sortedUnique(names))} all ADD the same ` +
          "requirement(s). A requirement can be added by at most one change.",
      };
    }
  }
  return null;
}

function push(m: Map<string, string[]>, k: string, v: string): void {
  if (!m.has(k)) m.set(k, []);
  m.get(k)!.push(v);
}

function sortedUnique(xs: string[]): string[] {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b));
}

function fmtList(xs: string[]): string {
  return xs.map((x) => `"${x}"`).join(", ");
}

/**
 * Compute inter-change dependency edges (A → B = "A archives before B").
 *   - A.adds ∩ (B.adds ∪ B.modifies ∪ B.removes)  → A before B
 *   - A.removes ∩ B.modifies                       → A before B
 * Edges only flow A → B when A ≠ B.
 */
function computeInterChangeEdges(changes: BulkChangeInput[]): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (const a of changes) {
    for (const b of changes) {
      if (a.name === b.name) continue;
      const bTouches = new Set([...b.adds, ...b.modifies, ...b.removes]);
      const aCreatesThatBTouches = a.adds.some((t) => bTouches.has(t));
      const aRemovesThatBModifies = a.removes.some((t) => b.modifies.includes(t));
      if (aCreatesThatBTouches || aRemovesThatBModifies) {
        edges.push([a.name, b.name]);
      }
    }
  }
  return edges;
}

/**
 * Deterministic topological sort with cycle detection. Tie-break is
 * lexicographic on node name (req 03.14 AC b) via a min-heap-free selection:
 * at each step, among ready nodes (indegree 0), pick the lexicographically
 * smallest. Returns `{ order, cycle: null }` on success or
 * `{ order: [], cycle }` when a cycle blocks ordering.
 */
function topoSort(
  nodes: string[],
  edges: Array<[string, string]>,
): { order: string[]; cycle: string[] | null } {
  const succ = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  for (const n of nodes) {
    succ.set(n, new Set());
    indeg.set(n, 0);
  }
  for (const [u, v] of edges) {
    if (!succ.get(u)!.has(v)) {
      succ.get(u)!.add(v);
      indeg.set(v, (indeg.get(v) ?? 0) + 1);
    }
  }

  const order: string[] = [];
  // Ready set, kept sorted so we always pop the lexicographically smallest.
  const ready = nodes
    .filter((n) => (indeg.get(n) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  while (ready.length > 0) {
    const u = ready.shift()!;
    order.push(u);
    // Collect newly-freed successors, then re-sort the ready pool.
    const freed: string[] = [];
    for (const v of succ.get(u) ?? []) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if ((indeg.get(v) ?? 0) === 0) freed.push(v);
    }
    if (freed.length > 0) {
      ready.push(...freed);
      ready.sort((a, b) => a.localeCompare(b));
    }
  }

  if (order.length < nodes.length) {
    // Remaining nodes are in cycles. Return them as the cycle for the message.
    const cycle = nodes.filter((n) => !order.includes(n)).sort((a, b) => a.localeCompare(b));
    return { order: [], cycle };
  }
  return { order, cycle: null };
}
