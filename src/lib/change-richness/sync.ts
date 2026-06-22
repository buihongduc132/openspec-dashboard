/**
 * Task 4.2 / req 03.15 — Change sync (no archive).
 *
 * Pure engine for syncing a long-running change's delta specs into the main
 * specs WITHOUT archiving (req 03.15). Produces a sidecar record of what was
 * synced and when, so re-sync is idempotent and manual unsync reverts the
 * last sync batch (cross-session via persisted records — NOT session memory).
 *
 *   - AC (a): re-sync detects already-applied deltas and skips them.
 *   - AC (b): manual unsync reverts the last sync batch; tombstoned in the
 *     audit log (the route layer performs the audit append + inverse-patch
 *     revert using `src/lib/changes/archive.ts`).
 *
 * The batchId is monotonic per change: each (re)sync that applies ANY new
 * title gets the next id; an all-skipped re-sync produces no new record.
 */
import type { BulkChangeInput, SyncRecord, SyncResult } from "@/lib/change-richness/types";

/** Re-export for route-layer composition. */
export type { BulkChangeInput, SyncRecord, SyncResult };

/**
 * Re-sync a change's delta against the main specs, skipping titles already
 * applied by prior sync records (req 03.15 AC a). Returns the new records to
 * persist (callers append to the sidecar) and the titles that were skipped.
 *
 * `prior` is the change's existing sidecar sync records (cross-session).
 * `now` is an ISO-8601 UTC timestamp supplied by the caller for determinism.
 */
export function resync(
  change: BulkChangeInput,
  prior: SyncRecord[],
  now: string,
): SyncResult {
  // The set of titles already applied across all prior batches for this change.
  const alreadyApplied = new Set<string>();
  for (const r of prior) {
    if (r.change !== change.name) continue;
    for (const t of r.appliedTitles) alreadyApplied.add(t);
  }

  // The delta titles this change would apply = everything it touches.
  const deltaTitles = [
    ...change.adds,
    ...change.modifies,
    ...change.removes,
  ];
  const skippedTitles = deltaTitles.filter((t) => alreadyApplied.has(t));
  const newTitles = deltaTitles.filter((t) => !alreadyApplied.has(t));

  if (newTitles.length === 0) {
    return { applied: [], skippedTitles };
  }

  // Monotonic batch id for this change: max prior batch id + 1, starting at 1.
  const maxBatch = prior
    .filter((r) => r.change === change.name)
    .reduce((m, r) => Math.max(m, r.batchId), 0);
  const record: SyncRecord = {
    change: change.name,
    batchId: maxBatch + 1,
    appliedTitles: newTitles,
    syncedAt: now,
  };
  return { applied: [record], skippedTitles };
}

/**
 * Revert the last sync batch (req 03.15 AC b). Returns the records remaining
 * after dropping the highest-batch records, plus the titles that were
 * reverted. Cross-session: the caller persists `remaining` (and the route
 * layer reverts the spec merges via the recorded inverse-patch, audit-logged).
 *
 * Records are scoped per change name: unsync targets the highest batch id
 * across the WHOLE history (the most recent sync). If multiple changes share
 * the same top batch id, all of them are reverted together (a single unsync
 * undoes one "sync round").
 */
export function unsyncLastBatch(records: SyncRecord[]): {
  remaining: SyncRecord[];
  reverted: string[];
} {
  if (records.length === 0) return { remaining: [], reverted: [] };
  const maxBatch = records.reduce((m, r) => Math.max(m, r.batchId), 0);
  const remaining = records.filter((r) => r.batchId !== maxBatch);
  const reverted = records
    .filter((r) => r.batchId === maxBatch)
    .flatMap((r) => r.appliedTitles);
  return { remaining, reverted };
}
