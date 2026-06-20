## ADDED Requirements

### Requirement: Project overview dashboard with reconciled counts
The system SHALL render a single-project landing dashboard showing: active changes count, specs count, archived changes count, task completion %, validation status, last activity timestamp, and top contributors. Counts SHALL reconcile with the filesystem within the refresh window (default 30s). API/agent consumers SHALL receive a `Last-Modified` header to detect staleness without a focus event. Click-through from any tile SHALL navigate to the scoped list view.

#### Scenario: Counts reconcile with filesystem
- **WHEN** a change is created and the refresh window elapses
- **THEN** the active-changes count on the dashboard increments to match the filesystem

#### Scenario: Click-through to scoped list
- **WHEN** a user clicks the "Active Changes" tile
- **THEN** the changes list page opens scoped to active changes

#### Scenario: Last-Modified header
- **WHEN** an API consumer requests the overview
- **THEN** the response includes a `Last-Modified` header reflecting the last filesystem change

#### Scenario: Project with no activity
- **WHEN** a newly registered project has no changes, specs, or tasks
- **THEN** the dashboard renders an empty-state with guidance (not zeros that mislead)

### Requirement: Change activity timeline from audit log
The system SHALL render a chronological activity feed within a project sourced from the audit log: change created, artifact edited, task completed, validation run, archive, restore. Each event SHALL deep-link to the affected entity. The feed SHALL be filterable by event type, actor, and change.

#### Scenario: Event deep-links to entity
- **WHEN** a user clicks a "task completed" event
- **THEN** they navigate to that task on the kanban board

#### Scenario: Filter by event type
- **WHEN** a user filters the feed to "archive" events
- **THEN** only archive events are shown

#### Scenario: Empty audit log
- **WHEN** a project has no audit events
- **THEN** the timeline renders an empty state (not an error)

### Requirement: Task velocity chart from audit completion events
The system SHALL render a burn-down/burn-up chart per change and per project showing velocity (tasks completed per day/week). The data SHALL be sourced from audit-log completion events (available from Phase 0). The chart SHALL support a configurable window (last 7/30/90 days).

#### Scenario: Velocity chart renders for last 30 days
- **WHEN** a user selects the 30-day window on the project velocity chart
- **THEN** tasks completed per day for the last 30 days are rendered as a burn-up line

#### Scenario: Velocity with no completion events
- **WHEN** no tasks have been completed in the selected window
- **THEN** the chart renders a flat line at zero (not an empty state — zero is valid data)

#### Scenario: Per-change velocity
- **WHEN** a user views a single change's velocity
- **THEN** the chart shows that change's task completion rate over time

### Requirement: Per-change progress tracking (req 04.20)
The system SHALL render a per-change progress bar (tasks done / total) and a per-project rollup. Progress SHALL exclude archived changes unless an "include archived" filter is on. The progress bar SHALL reconcile with the kanban task state within the refresh window.

#### Scenario: Per-change progress bar
- **WHEN** a user views a change's detail page
- **THEN** the progress bar shows (tasks done / total tasks) for that change, excluding archived changes unless the filter is on

#### Scenario: Per-project rollup
- **WHEN** a user views the project overview
- **THEN** the rollup shows aggregate progress (total done / total tasks) across all active changes, excluding archived changes unless the filter is on

#### Scenario: Archived changes excluded
- **WHEN** the "include archived" filter is off
- **THEN** completed tasks from archived changes are excluded from both per-change and per-project progress

#### Scenario: Archived changes included
- **WHEN** the "include archived" filter is on
- **THEN** completed tasks from archived changes are included in the progress calculation
