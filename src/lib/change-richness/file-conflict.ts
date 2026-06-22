/**
 * Task 4.3 / req 06 §6.4b — File-level conflict detection.
 *
 * Pure detector for file-level conflicts at archive time. Concurrent edits to
 * the same `specs/<domain>.md` across the selected set are detected by
 * comparing the pre-archive main-spec content hash vs each change's expected
 * base hash. A mismatch means the main spec evolved after the change was
 * pinned (e.g. another change archived first, or a manual edit landed) — the
 * change's delta no longer applies cleanly and the resolution UI must be
 * offered before it can archive (6.4b AC b + AC c).
 *
 * The detector is the file-level superset of the requirement-level matrix in
 * `src/lib/change-richness/bulk-archive.ts` (req 06.4a). Requirement-level
 * conflicts are surfaced by `planBulkArchive`; file-level drift is surfaced
 * here. The route layer composes the two before committing any archive.
 *
 * Determinism: conflicts are emitted sorted by `(change, domain)` so the
 * report is reproducible regardless of input order, matching the
 * lexicographic-stable-output contract of the sibling richness modules.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.4b.
 */
import type {
  FileConflictChangeInput,
  FileConflictReport,
  FileLevelConflict,
} from "@/lib/change-richness/types";

/** Re-export for route-layer composition. */
export type {
  FileConflictChangeInput,
  FileConflictReport,
  FileLevelConflict,
};

/**
 * Detect file-level conflicts across `changes` against the current
 * `mainSpecHashes` (a `domain → content hash` projection of the pre-archive
 * main spec).
 *
 * A change conflicts on a domain iff:
 *   - the domain IS in `mainSpecHashes` and the change's `expectedBaseHash`
 *     differs from the current main hash (the main spec evolved), OR
 *   - the domain is NOT in `mainSpecHashes` (it was removed upstream since the
 *     change was pinned) — reported with `currentMainHash: null`.
 *
 * Domains the change carries that DO match the current main hash are clean
 * and emit no conflict. An empty change set is trivially clean.
 *
 * Per 6.4b AC (c), `canArchive` mirrors `clean`: any conflict blocks archive
 * of the entire set until the resolution UI (3-way merge, re-pin, or split)
 * has reconciled every diverged base.
 */
export function detectFileConflicts(
  changes: FileConflictChangeInput[],
  mainSpecHashes: Record<string, string>,
): FileConflictReport {
  const conflicts: FileLevelConflict[] = [];

  for (const change of changes) {
    for (const [domain, expectedBaseHash] of Object.entries(change.baseHashes)) {
      const currentMainHash = mainSpecHashes[domain] ?? null;
      if (currentMainHash === expectedBaseHash) continue; // clean
      conflicts.push({
        change: change.name,
        domain,
        expectedBaseHash,
        currentMainHash,
      });
    }
  }

  // Deterministic order: by (change, domain) — stable regardless of input
  // iteration order (Object.entries order would otherwise leak through).
  conflicts.sort((a, b) => {
    const byChange = a.change.localeCompare(b.change);
    if (byChange !== 0) return byChange;
    return a.domain.localeCompare(b.domain);
  });

  const clean = conflicts.length === 0;
  return { conflicts, clean, canArchive: clean };
}
