## ADDED Requirements

### Requirement: Org-level rollup metrics
The system SHALL compute org-level rollups across all registered projects: total active changes, total open validation errors, and aggregate task completion percentage. These rollups SHALL be computed by a shared metric module reused by the single-project card view (req 1.6 / 7.1) so per-project and org-level numbers never diverge. The aggregate task completion percentage SHALL be task-count-weighted, computed as `(sum of completed tasks across all projects) / (sum of total tasks across all projects) × 100`, NOT a simple average of per-project percentages. This weighting ensures a project with 1 task does not outweigh a project with 100 tasks in the org number.

#### Scenario: Rollups across multiple projects
- **WHEN** three projects are registered with 2, 0, and 5 active changes respectively
- **THEN** the multi-project overview reports 7 total active changes

#### Scenario: Aggregate task completion is task-count-weighted
- **WHEN** project A has 100 tasks with 50 done (50%) and project B has 1 task with 1 done (100%)
- **THEN** the aggregate task completion percentage is 51/101 ≈ 50.5%, NOT the 75% a simple average of per-project percentages would yield

#### Scenario: No projects registered
- **WHEN** no projects are registered
- **THEN** the overview renders an empty state with zero counts and guidance to register a project, and returns no error

#### Scenario: No tasks across all projects
- **WHEN** projects are registered but none have any tasks
- **THEN** the aggregate task completion percentage renders an explicit "no tasks" state rather than dividing by zero

### Requirement: Per-project health cards with sort and filter
The system SHALL render one health card per registered project showing the same metrics as req 1.6 (active changes, task completion %, validation status, last activity). Cards SHALL be sortable by health, activity, and owner, and filterable by the same dimensions.

#### Scenario: Sort by health
- **WHEN** the user selects the health sort
- **THEN** cards are ordered with "At risk" projects before "Needs review" before "On track", deterministically tie-broken by project name

#### Scenario: Filter by owner returns nothing
- **WHEN** the user filters by an owner that owns no projects
- **THEN** an empty filter state is shown and the org-level rollups update to reflect only the filtered set

### Requirement: Cross-project activity heatmap
The system SHALL render a cross-project activity heatmap: activity intensity by day across all projects, sourced from the audit log. Each cell SHALL deep-link to that day's filtered activity feed.

#### Scenario: Heatmap cell links to activity
- **WHEN** the user clicks a day cell in the heatmap
- **THEN** the activity feed filters to events from all projects on that day

#### Scenario: Day with zero activity
- **WHEN** a day has no audit events across any project
- **THEN** that cell renders in the lowest intensity tier and is not hidden

### Requirement: Rollup freshness bound to refresh window
The system SHALL bound rollup staleness to the configured refresh window; counts SHALL reconcile with the canonical filesystem + audit log state within that window.

#### Scenario: Recently archived change reflects in rollup
- **WHEN** a change is archived and the refresh window elapses
- **THEN** the active-changes count for that project and the org rollup decrement, and the archived count increments

#### Scenario: Rollup query times out
- **WHEN** an analytics query exceeds its time budget
- **THEN** the system returns the last successfully computed cached result with a stale indicator rather than failing the page load
