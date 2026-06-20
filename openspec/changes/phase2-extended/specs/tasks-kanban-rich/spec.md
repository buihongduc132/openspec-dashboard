## ADDED Requirements

### Requirement: Swimlanes
The system SHALL render the kanban board as a 2D grid of configurable swimlanes (rows) × status columns. Swimlane grouping SHALL support at least: change, spec domain, assignee, label, and priority. Swimlane collapse/expand state SHALL persist per user. A "No lane" fallback SHALL group tasks missing the chosen grouping attribute.

#### Scenario: Group by change
- **WHEN** the user selects "change" as the swimlane grouping
- **THEN** each active change with tasks in the current board scope forms its own row, and a "No lane" row collects tasks whose change is unset

#### Scenario: Cell counts
- **WHEN** the board renders with swimlanes and columns
- **THEN** each cell displays the count of tasks in that (swimlane, column) intersection

#### Scenario: Collapse state persists
- **WHEN** a user collapses a swimlane and reloads the board
- **THEN** that swimlane remains collapsed for that user without any extra action

#### Scenario: Ungroupable task
- **WHEN** a task has no value for the active grouping attribute (e.g. grouping by assignee on an unassigned task)
- **THEN** the task appears in a dedicated "No lane" swimlane rather than being hidden

### Requirement: Task detail panel
The system SHALL open a slide-out or modal detail panel on card click showing: full rendered-Markdown description, parent change context, related requirements parsed from the change's delta specs, labels, assignees, due date, dependencies, comments, and activity. Edits in the panel SHALL update both the canonical Markdown (title/body, region-scoped per INV-2) and the sidecar metadata. The panel SHALL be deep-linkable at `/project/<id>/task/<uuid>`.

#### Scenario: Open panel via deep link
- **WHEN** a browser navigates to `/project/<id>/task/<uuid>` for an existing task
- **THEN** the board loads with that task's detail panel open and scrolled into view

#### Scenario: Edit title updates only that line
- **WHEN** a user edits a task title in the panel
- **THEN** only that task line's text region is rewritten in `tasks.md` (INV-2) and the sidecar metadata updates; every other byte is frozen

#### Scenario: Missing task
- **WHEN** a deep link targets a UUID with no matching task
- **THEN** the panel shows a "task not found" state and never crashes the board

### Requirement: Composable task filters and saved views
The system SHALL let the user filter the board by: change, assignee, label, priority, spec domain, due-date range, completion status, and free text. Filters SHALL compose with AND semantics. A filtered state SHALL be saveable as a named view; named views are per-user but shareable by URL. An active-filter count badge SHALL appear on the filter control.

#### Scenario: Compose filters
- **WHEN** a user applies "assignee = alice" AND "priority = high"
- **THEN** only tasks matching both criteria appear on the board

#### Scenario: Share a saved view
- **WHEN** a user saves the current filter set as "High-priority mine" and shares the URL
- **THEN** another user opening that URL loads the same filter set applied

#### Scenario: Active filter count
- **WHEN** three filters are active
- **THEN** the filter control shows a badge with the number 3

### Requirement: Task search widened to comments and sub-checklists
The system SHALL provide full-text search across all task titles, descriptions, comments, and sub-checklist items in a project, with jump-to-card on hit. Search SHALL index new content within 2s of write (NFR-6, INV-8). When invoked from a filtered board, results SHALL scope to the active filter. Comment and sub-checklist hits SHALL link to the owning task.

#### Scenario: Hit inside a comment
- **WHEN** a user searches for a term that appears only in a task comment
- **THEN** the result links to the owning task card and the comment is highlighted

#### Scenario: Index freshness after a new comment
- **WHEN** a comment is added and the user searches for one of its words within 2 seconds
- **THEN** the comment is already findable (NFR-6)

#### Scenario: Scoped to active filter
- **WHEN** the board is filtered to "change = X" and the user searches
- **THEN** only tasks in change X are searched

### Requirement: Task dependencies
The system SHALL allow task→task dependencies (blocks / blocked-by) within and across changes, resolved by task UUID (stable across Markdown renumbering). Dependencies SHALL visualize as a graph. The system SHALL reject dependency cycles with a clear error. A task with an uncompleted blocker SHALL NOT be draggable into the Done column.

#### Scenario: Cross-change dependency by UUID
- **WHEN** task A in change X is marked blocked-by task B in change Y, and change Y's tasks are renumbered out-of-band
- **THEN** the dependency still resolves to task B because binding is by UUID, not number

#### Scenario: Cycle rejected
- **WHEN** a user attempts to set A blocks B, B blocks C, C blocks A
- **THEN** the system rejects the final edge with an error naming the cycle and no dependency is written

#### Scenario: Blocker gates Done
- **WHEN** a user drags a task with an uncompleted blocker toward the Done column
- **THEN** the drag is rejected with a message listing the uncompleted blocker

### Requirement: Task assignments
The system SHALL allow assigning one or more users to a task, stored in the sidecar. Multi-assignee SHALL be supported (Wekan/Vikunja parity). An assignee SHALL be a project member (membership enforced once auth exists; in Phase 2 single-user-local mode the field accepts any string and is validated against the project member list when that list is non-empty).

#### Scenario: Multi-assignee
- **WHEN** a user assigns two people to a task
- **THEN** both avatars render on the card and both names appear in the detail panel

#### Scenario: Non-member assignee rejected when member list exists
- **WHEN** a project has a non-empty member list and a user attempts to assign a non-member
- **THEN** the assignment is rejected with an error; in single-user-local mode with an empty member list, any string is accepted

### Requirement: Project-scoped task labels
The system SHALL support project-scoped labels (name + color), multi-label per task. Label CRUD SHALL be admin-gated. Label colors SHALL be restricted to accessible contrast ratios (NFR-9).

#### Scenario: Project-scoped taxonomy
- **WHEN** project A defines a label "bug" (red) and project B defines "bug" (blue)
- **THEN** the two labels are independent; assigning in project A never surfaces project B's label

#### Scenario: Inaccessible color rejected
- **WHEN** an admin picks a color whose contrast against the card background fails the NFR-9 threshold
- **THEN** the picker rejects the color and suggests an accessible alternative

### Requirement: Threaded task comments
The system SHALL provide threaded, Markdown-rendered comments per task. Comments SHALL be append-mostly; edits and deletes SHALL emit audit-log entries (cross-session restorable, INV-4). Comments SHALL be indexed for search (INV-8). @-mentions SHALL record the mentioned identity; notification delivery is a no-op until notifications exist.

#### Scenario: Append a comment
- **WHEN** a user adds a comment to a task
- **THEN** the comment is appended to the task's comment log, rendered as Markdown, and findable by search within 2s

#### Scenario: Delete is restorable cross-session
- **WHEN** a user deletes a comment and the server restarts
- **THEN** the deletion tombstone persists in the audit log and the comment is restorable across sessions (INV-4)

#### Scenario: Mention recorded
- **WHEN** a comment contains "@alice"
- **THEN** the mention is recorded against alice's identity; no notification is sent in Phase 2 (notifications deferred)

### Requirement: Sub-checklists
The system SHALL support sub-checklists inside a task (distinct from the Markdown hierarchy), stored in the sidecar only so they never pollute canonical `tasks.md`. A progress bar SHALL show sub-items done / total. A one-way "Convert to Markdown task" action SHALL create a new top-level Markdown task and remove the sub-checklist item, with confirmation. Sub-checklist items SHALL be indexed for search (INV-8).

#### Scenario: Sidecar-only storage
- **WHEN** a user adds a sub-checklist to a task
- **THEN** the canonical `tasks.md` for that change is byte-unchanged (INV-1) and the sub-checklist lives only in the sidecar

#### Scenario: Convert to Markdown task
- **WHEN** a user confirms "Convert to Markdown task" on a sub-checklist item
- **THEN** a new top-level `- [ ]` task is inserted in `tasks.md` with a fresh UUID and the sub-checklist item is removed from the sidecar; the action is one-way and audit-logged

#### Scenario: Sub-checklist searchable
- **WHEN** a user searches for text present only in a sub-checklist item
- **THEN** the owning task is returned in results

### Requirement: Timezone-aware due dates
The system SHALL support optional task due dates. The server SHALL store UTC; the UI SHALL display in the user's timezone (detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`) with a manual override in user prefs. Overdue tasks SHALL be highlighted; a "due this week" board filter SHALL exist. The system SHALL warn when an overdue task's parent change has no target date.

#### Scenario: Timezone display
- **WHEN** a task has due date 2026-07-01 00:00 UTC and the user is in UTC-5
- **THEN** the card displays the due date as 2026-06-30 19:00 in the user's timezone

#### Scenario: Manual timezone override
- **WHEN** a user sets a manual timezone in prefs that differs from the detected one
- **THEN** all due dates render in the manual timezone

#### Scenario: Overdue without change target date
- **WHEN** a task is overdue and its parent change has no target date
- **THEN** the UI surfaces a due-date-drift warning on the task

### Requirement: List view
The system SHALL provide a sortable, filterable table view as an alternative to the kanban board. Column show/hide and ordering SHALL persist per user. The view SHALL support bulk-select and bulk-act (status change, assign, label, due date).

#### Scenario: Persisted column layout
- **WHEN** a user hides the "priority" column and reorders "assignee" before "title", then reloads
- **THEN** the list view retains that layout for that user

#### Scenario: Bulk-act from list
- **WHEN** a user selects five tasks and chooses "set due date = Friday"
- **THEN** all five tasks receive that due date in one atomic-per-change operation

### Requirement: Calendar view
The system SHALL provide month and week calendar views showing tasks by due date, with drag-to-reschedule. The calendar SHALL be read-only when the active filters exclude all dated tasks (no empty-calendar editing). Drag-to-reschedule SHALL update the sidecar due date.

#### Scenario: Drag to reschedule
- **WHEN** a user drags a task from Wednesday to Thursday on the calendar
- **THEN** the task's sidecar due date updates to Thursday (UTC-normalized) and the card moves

#### Scenario: Read-only when no dated tasks
- **WHEN** the active filters exclude every dated task
- **THEN** the calendar renders read-only and drag is disabled to prevent editing an empty surface

### Requirement: Per-change progress and velocity rollup
The system SHALL compute per-change progress (tasks done / total) and a per-project overview rollup. Progress SHALL exclude archived changes unless an "include archived" filter is on. Velocity (tasks completed per unit time) SHALL be fed by the Phase 0 audit log's completion events.

#### Scenario: Exclude archived by default
- **WHEN** a project has two archived changes and three active ones
- **THEN** the default progress rollup counts only the three active changes

#### Scenario: Velocity from audit log
- **WHEN** the audit log records task completions over the last two weeks
- **THEN** the velocity chart plots completed-tasks-per-day for that window

### Requirement: Bulk operations atomic per change
The system SHALL provide bulk move, bulk assign, bulk label, bulk complete, and bulk delete across a filtered task set. Destructive bulk ops SHALL show a preview and require confirmation. Bulk ops SHALL be atomic per change folder (all-or-nothing within a single change); bulk ops spanning multiple changes execute as N independent per-change transactions, with partial failure leaving completed changes committed and failed changes rolled back plus a per-change result report.

#### Scenario: Atomic within one change
- **WHEN** a bulk-complete of 10 tasks in change X fails on the 7th task
- **THEN** all 10 tasks in change X roll back to their pre-bulk state (no partial completion)

#### Scenario: Multi-change partial failure
- **WHEN** a bulk op spans changes X and Y, and X succeeds but Y fails
- **THEN** X's changes are committed, Y's are rolled back, and the UI reports per-change success/failure

#### Scenario: Destructive preview
- **WHEN** a user triggers bulk delete on a filtered set
- **THEN** a preview lists every task to be deleted and requires explicit confirmation before any deletion

### Requirement: Real-time board updates
The system SHALL push board updates to all open boards for a project within 2s when another user moves or edits a card. The push channel SHALL degrade gracefully (polling fallback) when the realtime transport is unavailable.

#### Scenario: Remote edit appears locally
- **WHEN** user A moves a card and user B has the same project board open
- **THEN** user B sees the card move within 2s without a manual reload

#### Scenario: Transport fallback
- **WHEN** the realtime transport (SSE/socket) fails to connect
- **THEN** the board falls back to polling and still reflects remote edits, with a degraded-connection indicator

### Requirement: Concurrent-edit merge UI
The system SHALL reject concurrent edits to the SAME section with HTTP 409 (per-section ETag, INV-7) and present a 3-way merge UI (yours / theirs / parent) using a Markdown-aware merge. The losing editor SHALL choose the resolution; the system SHALL NEVER silently overwrite. Different-section concurrent edits SHALL both succeed. Presence indicators SHALL show who else is viewing/editing the board.

#### Scenario: Same-section conflict
- **WHEN** two users edit the same task line and the second save arrives with a stale ETag
- **THEN** the second save is rejected with 409 and the merge UI shows yours/theirs/parent for that line

#### Scenario: Different-section concurrent success
- **WHEN** two users edit two different task lines in the same file simultaneously
- **THEN** both saves succeed because ETags are section-scoped (INV-7), not file-scoped

#### Scenario: Presence indicator
- **WHEN** another user is viewing the same board
- **THEN** a presence indicator shows that user's identity without revealing other projects' activity
