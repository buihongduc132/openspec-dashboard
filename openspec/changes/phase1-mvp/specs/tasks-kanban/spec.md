## ADDED Requirements

### Requirement: Sidecar metadata contract with UUID task IDs
The system SHALL maintain a per-change sidecar `openspec/.dashboard/tasks/<changeSlug>.json` carrying: stable UUID task IDs (assigned at first-seen by the server), display numbers, order, status, and group/parent chain. The sidecar schema SHALL be versioned (`schemaVersion: 1`); breaking changes bump the major and ship a tested migrator. The canonical `tasks.md` SHALL remain valid OpenSpec without the sidecar. Two tasks with identical prose SHALL get distinct UUIDs (no content-hash collision). Assignees, labels, due dates, dependencies, comments, and sub-checklists arrive in schemaVersion 2 (Phase 2).

#### Scenario: First-seen UUID assignment
- **WHEN** a new task line appears in `tasks.md` for the first time
- **THEN** the server assigns a fresh UUID persisted in the sidecar as the primary key

#### Scenario: Tasks with identical prose
- **WHEN** two task lines have identical `(parent-chain, prose)`
- **THEN** each gets a distinct UUID (consumed-set prevents reuse)

#### Scenario: Canonical Markdown valid without sidecar
- **WHEN** the sidecar is deleted
- **THEN** `tasks.md` remains valid OpenSpec and the board degrades to a read-only checkbox view (INV-5)

### Requirement: Task parsing preserves non-canonical markers
The system SHALL parse `tasks.md` checkbox lines (`- [ ] …`) into structured task records: UUID, display number, title, completed, parent group, raw Markdown line range. Other list markers (`*`, `1.`) SHALL be accepted read-only and flagged as non-canonical; writes normalize to `-`. The parser SHALL handle nesting up to `MAX_TASK_DEPTH` (3); deeper nesting is preserved verbatim in Markdown (INV-2) AND promoted to a "raw Markdown" board lane. Tasks outside a numbered scheme get a UUID and a low-confidence display-number warning.

#### Scenario: Parse mixed markers
- **WHEN** `tasks.md` contains `-`, `*`, and `1.` markers
- **THEN** all are parsed into structured records; `*` and `1.` are flagged as non-canonical

#### Scenario: Deep nesting promoted to raw lane
- **WHEN** a task is nested 4 levels deep (beyond MAX_TASK_DEPTH)
- **THEN** it is preserved in the Markdown verbatim and appears in the board's "raw Markdown" lane with a UUID but no structured card fields

#### Scenario: Idempotent re-parse
- **WHEN** parse→serialize→parse is run on the same task set
- **THEN** the result is identical (INV-2 preserved outside edited regions)

### Requirement: Task serialization with region-scoped rewrites
The system SHALL write task state back to `tasks.md` preserving: heading groups, prose between tasks, indentation, non-task list items, and code blocks. Only the explicitly-edited region SHALL be rewritten. Markers (`-`, `*`, `1.`) SHALL be preserved as-written; non-canonical markers surfaced as warnings, NEVER rewritten. A round-trip parse→serialize→parse SHALL produce an identical task set.

#### Scenario: Edit a single task line
- **WHEN** a user edits one task's title
- **THEN** only that line's text region is rewritten; all other bytes are frozen

#### Scenario: Prose between tasks preserved
- **WHEN** a user reorders tasks
- **THEN** any prose paragraphs between task lines are byte-for-byte preserved

### Requirement: Kanban board with Done flag identification
The system SHALL render a kanban board with default columns (Backlog → Ready → In Progress → Review → Done). Columns SHALL be configurable per project. Cards SHALL be tasks from all changes (or scoped by filter). The "Done" column SHALL be identified by a stable `isDone: true` flag in the column config, not by name. Toggling into Done flips the Markdown `- [x]`; toggling out flips `- [ ]`. Card position within a column SHALL be persisted (sidecar `order`). Board state SHALL survive Markdown renumbering (cards track by UUID). A degraded read-only board (checkboxes only, no columns) SHALL be available when the sidecar is absent.

#### Scenario: Done toggle updates Markdown
- **WHEN** a task is dragged into the Done column
- **THEN** its Markdown line flips to `- [x]` and the sidecar status updates

#### Scenario: Renaming Done column preserves semantics
- **WHEN** the Done column is renamed to "Shipped"
- **THEN** completion semantics are unchanged because `isDone: true` is the identifier, not the name

#### Scenario: Board survives renumbering
- **WHEN** task numbers change due to reordering
- **THEN** cards remain correctly bound by UUID

#### Scenario: Degraded board without sidecar
- **WHEN** the sidecar is absent
- **THEN** a read-only checkbox board renders (no columns, no DnD)

### Requirement: Task cards with density toggle
Each card SHALL display: display number, title, parent change name (badge), completion checkbox, and priority flag. A card density toggle (compact / comfortable) SHALL be available. Hovering a card SHALL show a quick preview (first 200 chars of description). Assignee avatars, label chips, due-date chip, and dependency indicator arrive in Phase 2 (req 4.13/4.14/4.17/4.12).

#### Scenario: Compact density toggle
- **WHEN** a user selects compact density
- **THEN** cards render with reduced padding

#### Scenario: Hover preview
- **WHEN** a user hovers a card with a description
- **THEN** a preview of the first 200 characters appears

### Requirement: Drag and drop with optimistic UI rollback
The system SHALL support dragging cards within a column (reorder) and across columns (status change). Drag SHALL update the sidecar `status` + `order` and (for Done) the Markdown checkbox. The UI SHALL update optimistically with rollback on server rejection (INV-7 per-section conflict). Multi-select drag SHALL be supported. Drag SHALL be touch + keyboard accessible (WCAG 2.1 AA + 2.2 AA incl. 2.5.7 Dragging Movements — NFR-9).

#### Scenario: Optimistic update with rollback
- **WHEN** a drag is initiated and the server later rejects (409 conflict)
- **THEN** the card rolls back to its original position with an error message

#### Scenario: Keyboard-only move
- **WHEN** a keyboard user focuses a card and moves it without a pointing device
- **THEN** the card can be relocated to any column (2.5.7 satisfied)

#### Scenario: Multi-select drag
- **WHEN** a user selects multiple cards and drags them to another column
- **THEN** all selected cards move together

### Requirement: Task CRUD with Markdown and sidecar sync
The system SHALL support creating, editing, and deleting tasks independently of editing `tasks.md` directly. Every CRUD op SHALL update both the Markdown (INV-2) and the sidecar. Creating a task inserts a new checkbox line at the chosen position with a fresh UUID in the sidecar. Deleting a task removes the line; the sidecar entry is tombstoned in the audit log (cross-session restorable, INV-4). Editing title/body rewrites only that line's text region. Every mutating task endpoint SHALL enforce per-section `If-Match` (INV-7) and emit an audit record (NFR-10). Bulk operations arrive in Phase 2 (req 4.23).

#### Scenario: Create task
- **WHEN** a user creates a task in change X
- **THEN** a new checkbox line is inserted with a fresh UUID in the sidecar

#### Scenario: Delete task tombstones
- **WHEN** a user deletes a task
- **THEN** the Markdown line is removed and the sidecar entry is tombstoned in the audit log (restorable across sessions)

### Requirement: Deterministic reconciliation with consumed-set
On every read, the system SHALL reconcile `tasks.md` against the sidecar using a single deterministic algorithm: parse Markdown into ordered `(parent-chain, prose-string)` tuples; maintain a consumed-sidecar-UUID set; for each Markdown tuple, bind to a sidecar entry with matching `(parent-chain, prose-string)` not in the consumed set (exactly one → bind; zero → assign new UUID; ≥2 → tie-break by lexicographically smallest UUID with reduced confidence). Sidecar UUIDs not consumed → orphans flagged, NEVER auto-deleted. Bindings with confidence < 0.5 SHALL be advisory-only (surfaced as "confirm?"). Reconciliation SHALL be idempotent for a given (Markdown, sidecar) pair.

#### Scenario: Ambiguous match tie-break
- **WHEN** two sidecar entries match the same `(parent-chain, prose-string)`
- **THEN** the lexicographically smallest UUID wins; confidence is reduced

#### Scenario: Orphan never auto-deleted
- **WHEN** a sidecar UUID has no matching Markdown tuple
- **THEN** it is flagged as an orphan warning and never auto-deleted or silently reattached

#### Scenario: Low-confidence advisory binding
- **WHEN** a binding has confidence < 0.5
- **THEN** the binding takes effect (board renders) but the user is prompted to confirm; advisory state is stored (no churn)

#### Scenario: Idempotent reconciliation
- **WHEN** reconciliation runs twice on the same (Markdown, sidecar) pair
- **THEN** the same UUID↔tuple bindings result

### Requirement: Markdown import/export with preview
The system SHALL support importing an arbitrary `tasks.md`-format file into structured records (merge or replace mode) with a preview diff before applying. Export SHALL serialize the current task set back to canonical `tasks.md`, byte-identical to what `openspec` itself would accept.

#### Scenario: Import preview shows diff
- **WHEN** a user imports a `tasks.md` file in merge mode
- **THEN** a diff vs current state is shown before applying

#### Scenario: Export produces canonical file
- **WHEN** a user exports the task set
- **THEN** the resulting file is byte-identical to what upstream `openspec` accepts

#### Scenario: Replace mode overwrites
- **WHEN** a user imports in replace mode and confirms
- **THEN** the current task set is replaced by the imported set

### Requirement: Real-time board updates with concurrent-edit merge UI
When another session/tab moves or edits a card, all open boards for that project SHALL update within 2 seconds. Concurrent edits to the SAME section (per-section ETag, INV-7) SHALL be rejected with a 409 and a 3-way merge UI (yours / theirs / parent) using a Markdown-aware merge library. Different-section concurrent edits SHALL both succeed. Presence indicators SHALL show that another session is viewing/editing the board (identity-bearing presence arrives in Phase 3a when auth exists).

#### Scenario: Real-time update within 2 seconds
- **WHEN** another session moves a card
- **THEN** the local board updates within 2 seconds

#### Scenario: Same-section conflict triggers merge UI
- **WHEN** two sessions edit the same task line concurrently and both submit
- **THEN** the second submission gets a 409 with a 3-way merge UI; never silent overwrite

#### Scenario: Different-section edits both succeed
- **WHEN** two sessions edit different task lines in the same file
- **THEN** both edits succeed (per-section ETag, not file-level)

### Requirement: Mutating endpoints enforce If-Match and emit audit records
Every mutating task endpoint (create, edit, delete, drag-reorder, done-toggle) SHALL require a per-section `If-Match` header (INV-7) when editing an existing section. Conflicting mutations SHALL return 409. Every mutating task endpoint SHALL emit an audit record (NFR-10) including action, section, actor session, and timestamp.

#### Scenario: Missing If-Match on a task edit is rejected
- **WHEN** a client sends a task edit (edit, delete, drag-reorder, or done-toggle) to an existing section without an `If-Match` header
- **THEN** the endpoint rejects it with 428 Precondition Required and no mutation occurs

#### Scenario: Conflicting task mutation returns 409
- **WHEN** client A edits task line 5 and commits, then client B edits task line 5 sending A's now-stale `If-Match`
- **THEN** B's request returns 409 with the current section ETag and a pointer to the merge UI; B's write is not applied

#### Scenario: Successful mutation emits an audit record
- **WHEN** a mutation with a valid `If-Match` commits
- **THEN** an audit record is emitted carrying action, section, actor session, and timestamp (NFR-10), and the response returns the new section ETag
