## ADDED Requirements

### Requirement: UUID task identity

Tasks SHALL have a stable UUID assigned at first-seen, stored in a sidecar
`openspec/.dashboard/tasks/<change>.json`. The Markdown `tasks.md` is the
display layer; the sidecar is the identity layer. Task numbers (`- [x] 1.2`)
are display-only and MUST NOT be used as the binding key.

Source: req 04 §4.1, D-ReqID, D-StableTaskIDs.

#### Scenario: Task survives renumbering

- **WHEN** a task line in `tasks.md` is renumbered (e.g. `1.2` → `2.1`) but
  its prose and parent-chain are unchanged
- **THEN** the task retains its original UUID and all history (status,
  comments, assignee) follows it.

### Requirement: Deterministic reconciliation

On every read, the dashboard SHALL reconcile `tasks.md` against the sidecar
using the algorithm in req 04 §4.21: parse Markdown into ordered
`(parent-chain, prose)` tuples, match against sidecar UUIDs by exact key,
using a **consumed-set** to guarantee two Markdown lines with identical
`(parent-chain, prose)` never bind to the same UUID. Ambiguous matches
(≥2 remaining) tie-break by lexicographically smallest UUID. Orphan sidecar
entries are flagged, never auto-deleted.

Source: req 04 §4.21.

#### Scenario: Duplicate prose lines get distinct UUIDs

- **WHEN** `tasks.md` contains two identical `- [ ] deploy` lines under the
  same parent group
- **THEN** each line binds to a distinct UUID (the consumed-set prevents the
  second from reusing the first's UUID), and both render on the board.

#### Scenario: Orphan sidecar entry is not deleted

- **WHEN** a sidecar UUID has no matching Markdown tuple
- **THEN** the dashboard flags it as an orphan warning and does NOT delete
  the sidecar entry or silently reattach it.

### Requirement: Kanban board with drag-and-drop

The dashboard SHALL render tasks on a kanban board with default columns
(backlog, ready, in-progress, review, done). Drag-and-drop moves tasks
between columns and persists status via `PATCH /api/tasks/[id]`. The board
MUST be keyboard and touch accessible (WCAG 2.1 AA + 2.2 AA incl. 2.5.7
Dragging Movements — NFR-9).

Source: req 04 §4.6.

#### Scenario: Drag task between columns

- **WHEN** a user drags a task card from "Backlog" to "In Progress" and drops
- **THEN** the task's status is persisted via PATCH and the card remains in
  the new column on reload.

#### Scenario: Keyboard-only task move

- **WHEN** a keyboard user focuses a task card and moves it without a
  pointing device
- **THEN** the task can be relocated to any column (2.5.7 Dragging Movements
  satisfied).
