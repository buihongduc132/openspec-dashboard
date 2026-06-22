/**
 * Task 2.19 — Deterministic reconciliation algorithm
 * (req 04 §4.21, consumed-set + lexicographic UUID tie-break).
 *
 * `reconcileTasks(markdownTuples, sidecarEntries)` is the SINGLE spec of
 * Markdown↔sidecar task binding (supersedes any prose in §4.1). It is a PURE
 * function called on every read: given the ordered Markdown tuples and the
 * current sidecar entries, it produces deterministic UUID↔tuple bindings,
 * flags orphan sidecar entries, and surfaces low-confidence advisories.
 *
 * Algorithm (§4.21):
 *   1. Parse Markdown into ordered `(parent-chain, prose)` tuples (caller).
 *   2. Maintain a consumed-UUID set. For each tuple, in Markdown order:
 *        key = (parent-chain, prose-string)
 *        matches = sidecar entries with key NOT yet consumed.
 *        - exactly one  → bind; consume.        confidence = 1.0
 *        - zero         → mint fresh UUID; consume. confidence = 1.0
 *        - ≥2 (ambiguous)→ lexicographically smallest UUID; consume.
 *                          confidence = 1 / (1 + matchCount)
 *   3. Sidecar UUIDs never consumed → orphans (flagged, never auto-deleted).
 *   4. confidence < 0.5 → advisory-only (surfaced, not re-prompted each read).
 *
 * Pure + injectable (UUID factory) for deterministic unit testing.
 *
 * @see src/lib/tasks-sidecar/sidecar.ts — first-seen migrator (identity layer
 *   bootstrap) uses the same `sidecarKey` semantics; this module is the
 *   full §4.21 binding contract.
 */
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { sidecarKey, type SidecarTaskEntry, type SidecarTaskTuple, type UuidFactory } from "./sidecar";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A Markdown `(parent-chain, prose)` tuple input to reconciliation. */
export type ReconcileTuple = SidecarTaskTuple;

/** A sidecar task entry input to reconciliation. */
export type ReconcileEntry = SidecarTaskEntry;

/** A resolved UUID↔tuple binding (output). */
export interface ReconcileBinding {
  /** Stable UUID bound to this Markdown tuple. */
  uuid: string;
  /** Echoed parent-chain of the Markdown tuple. */
  parentChain: string[];
  /** Echoed prose of the Markdown tuple. */
  prose: string;
  /** Binding confidence in `[0, 1]` per §4.21.4. */
  confidence: number;
  /** `true` iff this UUID was freshly minted (zero sidecar matches). */
  fresh: boolean;
}

/** A sidecar entry not bound to any Markdown tuple (§4.21.3). */
export interface ReconcileOrphan {
  uuid: string;
  parentChain: string[];
  prose: string;
}

/** A low-confidence binding the UI should prompt the user to confirm. */
export interface ReconcileAdvisory {
  uuid: string;
  confidence: number;
}

/** Reconciliation result. */
export interface ReconcileResult {
  /** Bindings in Markdown-tuple order. */
  bindings: ReconcileBinding[];
  /** Orphan sidecar entries (consumed-set never bound them). */
  orphans: ReconcileOrphan[];
  /** Low-confidence bindings (confidence < {@link LOW_CONFIDENCE_THRESHOLD}). */
  advisories: ReconcileAdvisory[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Confidence below which a binding is advisory-only (§4.21.4). A binding with
 * `confidence < 0.5` is surfaced as "low-confidence binding, confirm?" — the
 * binding still takes effect (board renders) but the user is prompted once.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5 as const;

// ─── Algorithm ──────────────────────────────────────────────────────────────

/**
 * Deterministically reconcile Markdown tuples against sidecar entries.
 *
 * @param markdownTuples Ordered `(parentChain, prose)` tuples parsed from
 *   `tasks.md` (Step 1 of §4.21).
 * @param sidecarEntries  Sidecar task entries (the identity layer).
 * @param uuidFactory     Injectable UUID v4 factory for fresh assignments
 *   (default: `node:crypto.randomUUID`). Receives the 1-based index of the
 *   UUID being minted.
 */
export function reconcileTasks(
  markdownTuples: ReconcileTuple[],
  sidecarEntries: ReconcileEntry[],
  uuidFactory: UuidFactory = defaultUuidFactory,
): ReconcileResult {
  // Pre-index sidecar entries by exact binding key for O(1) lookup while
  // still respecting the consumed-set + tie-break rules. Entries are kept
  // sorted by UUID so the lexicographic tie-break is just "first available".
  const bucketsByKey = new Map<string, ReconcileEntry[]>();
  for (const entry of sidecarEntries) {
    const key = sidecarKey(entry.parentChain, entry.prose);
    const bucket = bucketsByKey.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      bucketsByKey.set(key, [entry]);
    }
  }
  // Sort each bucket once so the consumed-set + lexicographic tie-break is a
  // simple "advance pointer" operation during the walk.
  for (const bucket of bucketsByKey.values()) {
    bucket.sort(compareUuid);
  }

  const bindings: ReconcileBinding[] = [];
  const consumed = new Set<string>();
  let freshIndex = 0;

  for (const { parentChain, prose } of markdownTuples) {
    const key = sidecarKey(parentChain, prose);
    const bucket = bucketsByKey.get(key) ?? [];
    // Remaining (non-consumed) matches, already in ascending UUID order.
    const remaining = bucket.filter((e) => !consumed.has(e.uuid));

    if (remaining.length === 0) {
      // §4.21.2 (zero remaining): mint a fresh UUID.
      freshIndex += 1;
      const uuid = uuidFactory(freshIndex);
      consumed.add(uuid);
      bindings.push({ uuid, parentChain, prose, confidence: 1, fresh: true });
    } else if (remaining.length === 1) {
      // §4.21.2 (exactly one): unambiguous bind.
      const uuid = remaining[0].uuid;
      consumed.add(uuid);
      bindings.push({ uuid, parentChain, prose, confidence: 1, fresh: false });
    } else {
      // §4.21.2 (≥2 remaining): lexicographically smallest UUID wins.
      // `remaining` is sorted ascending, so [0] is the smallest.
      const winner = remaining[0];
      consumed.add(winner.uuid);
      const matchCount = remaining.length;
      bindings.push({
        uuid: winner.uuid,
        parentChain,
        prose,
        confidence: 1 / (1 + matchCount),
        fresh: false,
      });
    }
  }

  // §4.21.3: orphan sidecar entries = never consumed by any tuple.
  const consumedSet = consumed;
  const orphans: ReconcileOrphan[] = sidecarEntries
    .filter((e) => !consumedSet.has(e.uuid))
    .map((e) => ({ uuid: e.uuid, parentChain: e.parentChain, prose: e.prose }));

  // §4.21.4: low-confidence advisories.
  const advisories: ReconcileAdvisory[] = bindings
    .filter((b) => b.confidence < LOW_CONFIDENCE_THRESHOLD)
    .map((b) => ({ uuid: b.uuid, confidence: b.confidence }));

  return { bindings, orphans, advisories };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultUuidFactory: UuidFactory = () => nodeRandomUUID();

/** Lexicographic comparator for UUID strings (§4.21.2 tie-break). */
function compareUuid(a: SidecarTaskEntry, b: SidecarTaskEntry): number {
  return a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0;
}
