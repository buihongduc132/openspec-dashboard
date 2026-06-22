/**
 * Task 4.1 — Rich task model (req 04 §4.5, §4.7–4.10, §4.12–4.17, §4.20).
 *
 * The board's task richness layer: assignees, labels, due dates, priority,
 * dependencies, comments, sub-checklists. The Markdown `tasks.md` remains
 * the display layer; this richness metadata lives in the sidecar identity
 * layer (see {@link SidecarTaskEntry}). These types describe the
 * dashboard-side view of a task surfaced to the board.
 */

/** Kanban status / column key. */
export type TaskStatus = "backlog" | "ready" | "in-progress" | "review" | "done";

/** Task priority (§4.5). */
export type Priority = "low" | "medium" | "high";

/** Dependency edge kind (§4.12). */
export type DependencyType = "blocks" | "blocked-by";

/** A dependency edge resolved by UUID (stable across renumbering). */
export interface Dependency {
  type: DependencyType;
  /** UUID of the other task. */
  taskId: string;
}

/** An append-mostly comment (§4.15), indexed for search (INV-8). */
export interface TaskComment {
  id: string;
  author: string;
  content: string;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

/** A sidecar-only sub-checklist item (§4.16), indexed for search (INV-8). */
export interface SubChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * A task with full board richness. Mirrors the DB `tasks` row + sidecar
 * metadata (comments / sub-checklists). Kept framework-agnostic so the pure
 * logic modules (swimlanes, filters, search, dependencies, progress, bulk)
 * can be unit-tested without React or DB bindings.
 */
export interface RichTask {
  id: string;
  changeId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** Column position / sort order. */
  orderIndex?: number;
  /** Markdown checkbox completion (synced with the "done" column). */
  checked?: boolean;
  assignees: string[];
  labels: string[];
  /** ISO-8601 UTC due date (server stores UTC, §4.17). */
  dueDate: string | null;
  priority: Priority | null;
  dependencies: Dependency[];
  comments: TaskComment[];
  subChecklist: SubChecklistItem[];
}
