/**
 * Task 4.2 / req 03.16 — Archive browsing & restore.
 *
 * Pure helpers over a projection of `changes/archive/`. Browsing supports
 * chronological ordering (newest first), filtering by inclusive date range,
 * substring name match (case-insensitive), and full-text content search.
 *
 * Restore gating (INV-4a) is provided by `computeRestoreStatus` in
 * `src/lib/changes/archive.ts`; this module is the browse/filter/search view
 * the user navigates to FIND an archived change before restoring it.
 *
 * The route layer projects `changes/archive/YYYY-MM-DD-<name>/` folders into
 * `ArchivedChange[]` (folder name → name + date; concatenated artifact text →
 * content corpus) and hands them here.
 */
import type { ArchivedChange } from "@/lib/change-richness/types";

/** Re-export for route-layer composition. */
export type { ArchivedChange };

/** Optional browse filters (all optional; omitted = no constraint). */
export interface BrowseFilter {
  /** Inclusive lower date bound (`YYYY-MM-DD`), or null. */
  from?: string | null;
  /** Inclusive upper date bound (`YYYY-MM-DD`), or null. */
  to?: string | null;
  /** Case-insensitive substring matched against the change name, or null. */
  name?: string | null;
  /** Full-text query matched against the archived content, or null. */
  query?: string | null;
}

/**
 * Browse archived changes with optional filtering, returned newest-first by
 * archived date (req 03.16). Date filters are inclusive; name match is
 * case-insensitive substring; query is case-insensitive substring over the
 * concatenated artifact content. Filters compose with AND semantics.
 */
export function browseArchive(
  archive: ArchivedChange[],
  filter: BrowseFilter,
): ArchivedChange[] {
  const from = filter.from?.trim() || null;
  const to = filter.to?.trim() || null;
  const name = filter.name?.trim().toLowerCase() || null;
  const query = filter.query?.trim().toLowerCase() || null;

  const filtered = archive.filter((a) => {
    if (from !== null && a.archivedDate < from) return false;
    if (to !== null && a.archivedDate > to) return false;
    if (name !== null && !a.name.toLowerCase().includes(name)) return false;
    if (query !== null && !a.content.toLowerCase().includes(query)) return false;
    return true;
  });

  // Newest first by archived date; tie-break by name for determinism.
  return filtered.sort((a, b) => {
    const byDate = b.archivedDate.localeCompare(a.archivedDate);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}
