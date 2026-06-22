/**
 * Task 4.1 — Task full-text search (req 04 §4.10, INV-8).
 *
 * Searches across titles + descriptions + comment bodies + sub-checklist
 * items. Hits resolve to the owning task; each hit reports which field(s)
 * matched so the UI can deep-link (e.g. comment hits link to the comment,
 * §4.10c). Case-insensitive substring; empty query returns no hits.
 */
import type { RichTask } from "./types";

/** Searchable field buckets. */
export type SearchField = "title" | "description" | "comments" | "subChecklist";

/** A search hit: owning task id + the field(s) that matched. */
export interface SearchHit {
  taskId: string;
  fields: SearchField[];
}

/**
 * Search `tasks` for `query` (case-insensitive substring). Returns one hit
 * per matching task listing every field that matched.
 */
export function searchTasks(tasks: RichTask[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const t of tasks) {
    const fields: SearchField[] = [];
    if (t.title.toLowerCase().includes(q)) fields.push("title");
    if (t.description && t.description.toLowerCase().includes(q)) fields.push("description");
    if (t.comments.some((c) => c.content.toLowerCase().includes(q))) fields.push("comments");
    if (t.subChecklist.some((s) => s.text.toLowerCase().includes(q))) fields.push("subChecklist");
    if (fields.length > 0) hits.push({ taskId: t.id, fields });
  }
  return hits;
}
