# Requirements 04 — Tasks & Kanban (Wekan/Vikunja parity)

> Tasks are a **projection** of `tasks.md` + a mandatory dashboard sidecar. Per D-TaskID,
> D-SidecarLoc, INV-2, INV-5, INV-7. Sidecar lives under
> `openspec/.dashboard/tasks/<changeSlug>.json`.

## 4.1 Sidecar metadata contract (foundational)

**Shall:** Define a per-change sidecar `openspec/.dashboard/tasks/<changeSlug>.json`
carrying: stable **UUID task IDs** (assigned at first-seen), display numbers, order,
assignees, labels, due dates, dependencies, comments, sub-checklists. The canonical
`tasks.md` MUST remain valid OpenSpec without the sidecar.

**AC:**
- (a) Sidecar schema is versioned (`schemaVersion: 1`); breaking changes bump the major and
  ship a tested migrator.
- (b) **Stable task IDs are UUIDs** assigned by the server on first-seen, persisted in the
  sidecar as the primary key. Display numbers (`1.2`) are derived on read from sidecar
  `order` + parent chain and are NEVER the identity. Two tasks with identical prose get
  distinct UUIDs (no content-hash collision).
- (c) Sidecar orphan entries (UUIDs no longer matched to a Markdown line by the
  reconciliation algorithm in §4.21) are surfaced as warnings and cleaned on explicit
  action. Reconciliation never silently drops an entry.
- (d) Out-of-band `$EDITOR` renumbering does NOT break ID binding: the server re-binds
  UUIDs to Markdown lines using (parent chain + prose hash + original order) heuristics,
  and flags low-confidence rebindings for manual confirmation rather than silently
  reattaching.

## 4.2 Task parsing (Markdown → structured)

**Shall:** Parse `tasks.md` checkbox lines (`- [ ] …` per upstream documented format) into
structured task records: UUID, display number, title, completed, parent group, raw Markdown
line range. Other list markers (`*`, `1.`) are accepted read-only but flagged as
non-canonical; writes normalize to `-`.

**AC:**
- (a) Parser handles arbitrary nesting depth up to `MAX_TASK_DEPTH` (dashboard constant);
  deeper nesting is preserved verbatim but not promoted to structured tasks.
- (b) Tasks outside a numbered scheme (plain `- [ ]`) get a UUID and a low-confidence
  display-number warning.
- (c) Re-parse is idempotent: parse→serialize yields equivalent Markdown (INV-2
  region-scoped).

## 4.3 Task serialization (structured → Markdown)

**Shall:** Write task state back to `tasks.md` preserving: heading groups, prose between
tasks, indentation, non-task list items, code blocks. Only the explicitly-edited region is
rewritten.

**AC:**
- (a) A round-trip parse→serialize→parse produces an identical task set.
- (b) Prose between tasks is byte-for-byte preserved (INV-2).

## 4.4 Kanban board view

**Shall:** Board with default columns **Backlog → Ready → In Progress → Review → Done**.
Columns are configurable per project. Cards are tasks from all changes (or scoped by
filter). Requires the sidecar (INV-5); a **degraded read-only board** (checkboxes only, no
columns) is available when the sidecar is absent.

**AC:**
- (a) Card position within a column is persisted (sidecar `order`).
- (b) The **"Done" column is identified by a stable `isDone: true` flag** in the column
  config, not by name. Toggling into Done flips the Markdown `- [x]`; toggling out flips
  `- [ ]`. Renaming the Done column never changes completion semantics.
- (c) Board state survives Markdown renumbering (cards track by UUID, not number).

## 4.5 Task cards

**Shall:** Each card displays: display number, title, parent change name (badge),
completion checkbox, assignee avatars, label chips, due-date chip (red if overdue),
priority flag, dependency indicator.

**AC:**
- (a) Card density toggle (compact / comfortable).
- (b) Hovering a card shows a quick preview (first 200 chars of description).

## 4.6 Drag & drop

**Shall:** Drag cards within a column (reorder) and across columns (status change). Drag
updates the sidecar `status` + `order` and (for Done) the Markdown checkbox.

**AC:**
- (a) Optimistic UI update with rollback on server rejection (INV-7 per-section conflict).
- (b) Multi-select drag (move several cards at once).
- (c) Touch + keyboard accessible (WCAG 2.1 AA — NFR-9, tested per-component from Phase 1).

## 4.7 Swimlanes

**Shall:** Horizontal swimlanes grouping rows by: change, spec domain, assignee, label, or
priority. Swimlane collapse/expand state persists per user.

**AC:**
- (a) Swimlane + column form a 2D grid; counts per cell.
- (b) "No lane" fallback for tasks missing the grouping attribute.

## 4.8 Task detail panel

**Shall:** Slide-out (or modal) panel on card click: full description (rendered Markdown),
parent change context, related requirements (parsed from the change's delta specs), labels,
assignees, due date, dependencies, comments, activity.

**AC:**
- (a) Edits in the panel update both Markdown (title/body, region-scoped) and sidecar
  (metadata).
- (b) Deep-linkable URL (`/project/<id>/task/<uuid>`).

## 4.9 Task filtering

**Shall:** Filter board by: change, assignee, label, priority, spec domain, due-date range,
completion status, free-text. Filters compose (AND); saveable as named views.

**AC:**
- (a) Active filter count badge on the filter button.
- (b) Saved views are per-user but shareable by URL.

## 4.10 Task search (scope widened per INV-8)

**Shall:** Full-text search across all task titles + descriptions + **comments** +
**sub-checklist items** in a project; jump-to-card on hit.

**AC:**
- (a) Index refresh ≤ 2s (NFR-6).
- (b) Search results scoped to current board filter when invoked from a filtered board.
- (c) Comments and sub-checklist hits link to the owning task.

## 4.11 Task CRUD

**Shall:** Create / edit / delete tasks independently of editing `tasks.md` directly. Every
CRUD op updates both the Markdown (INV-2) and the sidecar.

**AC:**
- (a) Creating a task in change X inserts a new checkbox line at the chosen position with a
  fresh UUID recorded in the sidecar.
- (b) Deleting a task removes the line; the sidecar entry is tombstoned in the audit log
  (cross-session restorable, INV-4).
- (c) Editing title/body rewrites only that line's text region.

## 4.12 Task dependencies

**Shall:** Define task→task dependencies (blocks / blocked-by) within and across changes,
resolved by **UUID**. Visualization as a dependency graph; cycles rejected with a clear
error.

**AC:**
- (a) A task with an uncompleted blocker cannot be dragged into Done.
- (b) Cross-change dependencies resolved by UUID (stable across renumbering).

## 4.13 Task assignments

**Shall:** Assign one or more users to a task. Stored in sidecar. Avatar rendering; mention
notifications (when notifications exist).

**AC:**
- (a) Multi-assignee supported (Wekan/Vikunja parity).
- (b) Assignee must be a project member (see `09-auth-multitenancy.md`).

## 4.14 Task labels / tags

**Shall:** Project-scoped labels with name + color. Multi-label per task. Label CRUD
admin-gated.

**AC:**
- (a) Labels are project-scoped (not global) to allow per-project taxonomies.
- (b) Color picker restricted to accessible contrast ratios (NFR-9).

## 4.15 Task comments

**Shall:** Threaded comments per task, Markdown-rendered, stored in sidecar (or a per-task
`openspec/.dashboard/comments/<taskUuid>.jsonl` append log).

**AC:**
- (a) Comments are append-mostly; edit/delete with audit-log entries (cross-session).
- (b) @-mentions notify the mentioned user (when notifications exist).
- (c) Comments are indexed for search (INV-8 / §4.10).

## 4.16 Task checklists (sub-tasks — sidecar only)

**Shall:** Sub-checklists inside a task (distinct from the Markdown hierarchy). Stored in
sidecar. Progress bar = sub-items done / total.

**AC:**
- (a) Sub-checklists do NOT pollute the canonical `tasks.md` (dashboard-only metadata).
- (b) "Convert to Markdown task" creates a new top-level Markdown task and removes the
  sub-checklist item (one-way, with confirmation); semantics documented in the UI.
- (c) Sub-checklist items are indexed for search (INV-8 / §4.10).

## 4.17 Task due dates

**Shall:** Optional due dates with timezone awareness. Overdue highlighting; "due this
week" board filter.

**AC:**
- (a) Server stores UTC; UI displays in the user's timezone, detected via
  `Intl.DateTimeFormat().resolvedOptions().timeZone` with a manual override in user prefs.
- (b) Due-date drift detection: warn if a task's change has no target date and the task is
  overdue.

## 4.18 List view

**Shall:** Sortable, filterable table view as an alternative to Kanban.

**AC:**
- (a) Column show/hide + ordering persisted per user.
- (b) Bulk-select + bulk-act (status change, assign, label, due date).

## 4.19 Calendar view

**Shall:** Month/week calendar showing tasks by due date. Drag-to-reschedule.

**AC:**
- (a) Calendar is read-only when filters exclude all dated tasks (no empty calendar).
- (b) Drag-to-reschedule updates the sidecar due date.

## 4.20 Progress tracking

**Shall:** Per-change progress bar (tasks done / total). Per-project overview rollup.
Velocity = tasks completed per unit time.

**AC:**
- (a) Progress excludes archived changes unless "include archived" filter is on.
- (b) Velocity chart fed by the audit log (completion events), available once the audit log
  is in place (Phase 0 — see plan).

## 4.21 Reconciliation algorithm (Markdown ↔ sidecar)

**Shall:** On every read, reconcile the Markdown task set with the sidecar:

1. Parse Markdown into ordered (parent-chain, prose) tuples.
2. For each Markdown tuple, find the sidecar UUID by: exact (parent-chain, prose) match →
   if unique, bind. If ambiguous, use original-order proximity; mark confidence.
3. Markdown tuples with no sidecar UUID → assign a new UUID (first-seen).
4. Sidecar UUIDs with no Markdown tuple → orphan; flag warning (do NOT auto-delete).
5. Low-confidence bindings → surface for manual confirmation.

**AC:**
- (a) Reconciliation is deterministic for a given (Markdown, sidecar) pair.
- (b) No silent UUID reassignment; every binding change is audit-logged.

## 4.22 Markdown import/export

**Shall:** Import: parse an arbitrary `tasks.md`-format file into structured records (merge
/ replace mode). Export: serialize current task set back to canonical `tasks.md`.

**AC:**
- (a) Import preview shows the diff vs current state before applying.
- (b) Export produces a file byte-identical to what `openspec` itself would accept.

## 4.23 Bulk operations

**Shall:** Bulk move, bulk assign, bulk label, bulk complete, bulk delete across a filtered
task set.

**AC:**
- (a) Bulk ops show a preview and require confirmation for destructive ones.
- (b) Bulk ops are atomic per change folder (all-or-nothing within a change).

## 4.24 Real-time board updates + concurrent-edit merge UI

**Shall:** When another user moves/edits a card, all open boards for that project update
within 2s. Concurrent edits to the SAME section (per-section ETag, INV-7) are rejected with
a 409 and a **3-way merge UI** (yours / theirs / parent) using a Markdown-aware merge
library (e.g. `diff-match-patch` on the section text).

**AC:**
- (a) Conflict on concurrent same-section edit → 409 + merge UI; losing editor chooses
  merge resolution; never silent overwrite (INV-7).
- (b) Presence indicators (who else is viewing/editing the board).
- (c) Different-section concurrent edits both succeed (per-section ETag, not file-level).
