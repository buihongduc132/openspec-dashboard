## ADDED Requirements

### Requirement: Change listing with artifact status badges
The system SHALL list every active (non-archived) change under `openspec/changes/<name>/` with: name, schema, artifact completion badges, creation date, initiative link, task completion %, and validation status. Artifact badges SHALL reflect file presence + non-empty + valid. The list SHALL be sortable by creation, last-modified, and task completion, and filterable by schema, initiative, and validation status.

#### Scenario: List with mixed-status changes
- **WHEN** a project has changes with varying artifact completeness
- **THEN** badges accurately show which artifacts are present, non-empty, and valid

#### Scenario: Filter by validation status
- **WHEN** the user filters by "validation errors"
- **THEN** only changes with current validation errors are shown

#### Scenario: Empty changes directory
- **WHEN** the project has no active changes
- **THEN** the list renders an empty state with a CTA to create one, not an error

### Requirement: Change detail with tabbed artifacts
The system SHALL render a change as tabs: Overview, Proposal, Design, Specs (delta), Tasks. Each tab renders the artifact Markdown with structured parsing where applicable. The Overview tab shows `.openspec.yaml` metadata, artifact dependency DAG (status overlay), validation status, linked initiative, and impact summary. Tabs SHALL degrade gracefully when an artifact is absent per schema; they SHALL never crash.

#### Scenario: Overview shows artifact DAG
- **WHEN** a change has proposal done but design blocked
- **THEN** the DAG visual shows proposal as done and design as blocked with the dependency edge

#### Scenario: Missing artifact degrades gracefully
- **WHEN** a change's schema marks an artifact as optional and it is absent
- **THEN** the tab either renders an empty state or is hidden per schema, without crashing

#### Scenario: Non-existent change
- **WHEN** the URL references a change name that does not exist
- **THEN** a 404 is returned with a clear message

### Requirement: Change creation with scaffolding
The system SHALL support creating a new change: name (kebab-case, uniqueness-checked), schema selection (resolution-aware), optional description/goal/areas. Scaffolding SHALL create `changes/<name>/` from the chosen schema's templates plus a `.dashboard/` metadata stub. Scaffolded canonical files SHALL pass `openspec validate` immediately. Schema template variables SHALL be injected at scaffold per `config.yaml` rules. Change creation SHALL emit an audit record (NFR-10).

#### Scenario: Successful change creation
- **WHEN** a user creates change "add-auth" with the spec-driven schema
- **THEN** the scaffolded files pass `openspec validate` and the change appears in the listing

#### Scenario: Duplicate name rejected
- **WHEN** a user attempts to create a change with a name that already exists
- **THEN** creation is rejected with the existing change's identifier

#### Scenario: Invalid kebab-case name
- **WHEN** a user enters "Add Auth!" as a change name
- **THEN** creation is rejected with a validation error explaining the kebab-case requirement

### Requirement: Change metadata edit with atomic rename
The system SHALL support editing `.openspec.yaml` (name, initiative, description, areas, status) through a form + raw YAML editor with live validation. Renaming a change SHALL move the folder atomically: `git mv` inside a git repo; plain filesystem rename outside a git repo (documented). Rename SHALL update references in server-side workspace manifests and initiative links with preview + confirm. Metadata edits SHALL enforce per-section `If-Match` (INV-7) on existing sections and SHALL emit an audit record (NFR-10).

#### Scenario: Rename via git mv
- **WHEN** a change is renamed inside a git repo
- **THEN** the folder is moved with `git mv` preserving history

#### Scenario: Rename outside git repo
- **WHEN** a change is renamed outside a git repo
- **THEN** a plain filesystem rename is used and the behavior is documented (no history to preserve)

#### Scenario: Invalid YAML in metadata edit
- **WHEN** the raw YAML editor contains invalid YAML
- **THEN** the save is rejected at the editor with line/column errors; nothing reaches disk

### Requirement: Artifact status tracking from schema DAG
The system SHALL compute per-artifact status from the schema DAG: done, ready, blocked, invalid. Status recompute SHALL be event-driven (file change), not polling. A visual DAG SHALL render the schema's dependency graph with status colors and click-through to the artifact editor.

#### Scenario: Blocked artifact becomes ready
- **WHEN** a dependency artifact is completed
- **THEN** the dependent artifact's status updates from blocked to ready event-driven

#### Scenario: Invalid artifact flagged
- **WHEN** an artifact fails validation
- **THEN** its status is set to invalid with the finding surfaced

### Requirement: Change validation gating archive
The system SHALL run `openspec validate <change>`-equivalent on demand or on save. Validation SHALL cover: structural integrity, schema conformance, delta-spec grammar, requirement-name collisions, and orphan references. Errors SHALL block archive; warnings surface but do not block. Results SHALL be surfaced inline on each artifact and as a unified report.

#### Scenario: Validation error blocks archive
- **WHEN** a change has a delta spec with a requirement-name collision
- **THEN** archive is blocked with the specific error

#### Scenario: Validation warning does not block
- **WHEN** a change has a non-canonical marker warning
- **THEN** archive is allowed; the warning is surfaced but non-blocking

### Requirement: Proposal and design editors with auto-save drafts
The system SHALL provide rich Markdown editors for `proposal.md` and `design.md` with section assistance (template-driven) and live validation. Design editor SHALL support ADR-style entries (context/decision/consequences) and a File Changes section with path autocomplete from the repo. Auto-save SHALL persist drafts to a `.dashboard/drafts/` sidecar (versioned), NOT to canonical files. Canonical files SHALL be written only on explicit save. Explicit saves to existing canonical sections SHALL enforce per-section `If-Match` (INV-7) and emit an audit record (NFR-10).

#### Scenario: Auto-save to sidecar
- **WHEN** a user types in the proposal editor without saving
- **THEN** the draft is auto-saved to `.dashboard/drafts/proposal.json`, not to `proposal.md`

#### Scenario: Explicit save writes canonical
- **WHEN** a user clicks Save
- **THEN** `proposal.md` is written and the draft sidecar is cleared

#### Scenario: Draft recovered after reload
- **WHEN** a user reloads after auto-save but before explicit save
- **THEN** the draft content is restored from the sidecar

### Requirement: Delta spec editor with preview archive result
The system SHALL provide a structured editor for `changes/<name>/specs/<domain>.md` with section verbs (ADDED/MODIFIED/REMOVED/RENAMED). It SHALL provide a visual diff against the matching main spec and a "Preview archive result" that renders the main spec with this delta applied — read-only, byte-accurate to what archive would produce. MODIFIED sections SHALL show a 3-way diff (main/delta/predicted). RENAMED sections SHALL enforce old-name existence in the main spec.

#### Scenario: Preview archive result
- **WHEN** a user clicks "Preview archive result" on a delta with ADDED + MODIFIED sections
- **THEN** the predicted post-archive main spec is rendered byte-accurately

#### Scenario: 3-way diff for MODIFIED
- **WHEN** a user views a MODIFIED section
- **THEN** a 3-way diff (main / delta / predicted) is shown

#### Scenario: RENAMED targets missing name
- **WHEN** a RENAMED section references a name not in the main spec
- **THEN** validation fails with a clear error

### Requirement: Task editor with deterministic numbering
The system SHALL provide an interactive checklist editor for `tasks.md` with hierarchical groups, checkboxes, and drag-reorder. Display numbering (`1`, `1.1`, …) SHALL be computed on read from sidecar order + parent chain and SHALL never be persisted to canonical Markdown as identity. Max nesting depth is a dashboard constant (`MAX_TASK_DEPTH = 3`). Canonical `tasks.md` numbering is left as the user wrote it (INV-2).

#### Scenario: Numbering derived from sidecar order
- **WHEN** a user reorders a task within a group
- **THEN** the display number updates to reflect the new position, but the canonical Markdown line is not renumbered

#### Scenario: Nesting beyond max depth
- **WHEN** a task is nested deeper than MAX_TASK_DEPTH (3)
- **THEN** it is preserved verbatim in the Markdown (INV-2) and promoted to a "raw Markdown" lane on the board

### Requirement: Single archive with inverse-patch and per-project mutex
The system SHALL archive a change: apply delta specs to main specs (inverse-patch recorded for restore), move the folder to `changes/archive/YYYY-MM-DD-<name>/`, and emit a git commit (when in a git repo) with a machine-readable message. Archive SHALL be gated by: all `apply.requires` artifacts present + valid, and no unresolved conflict with another active change on the same requirement (6.4a matrix). A per-project archive mutex SHALL hold for the sequence (apply deltas → git add → git commit). On git failure, the delta application is rolled back; spec-file and git state SHALL never diverge. Two concurrent archives on the same project SHALL serialize; one waits, neither corrupts.

#### Scenario: Successful archive
- **WHEN** a valid change with no conflicts is archived
- **THEN** deltas are applied to main specs, the folder moves to the archive dir, and a git commit is emitted

#### Scenario: Archive blocked by validation error
- **WHEN** a change has a missing required artifact
- **THEN** archive is rejected with the specific missing artifact

#### Scenario: Git failure rolls back
- **WHEN** the git commit fails during archive
- **THEN** the delta application is rolled back; main specs and git state are unchanged

#### Scenario: Concurrent archives serialize
- **WHEN** two archives are triggered on the same project simultaneously
- **THEN** they serialize via the mutex; the second waits, neither corrupts the state

### Requirement: Restore via inverse-patch with INV-4a unrestorable state
The system SHALL support restoring an archived change by reverting spec merges using the recorded inverse-patch. Restore SHALL be cross-session (tombstone + inverse-patch in audit log). If a later-archived change (per archive sequence number, D-ArchiveSeq) has since modified the same requirement UUID, restore SHALL enter the INV-4a "unrestorable" state with the reason recorded. The original delta files SHALL be preserved inside the archived folder as an audit trail.

#### Scenario: Successful restore
- **WHEN** an archived change is restored and no later change touched the same requirements
- **THEN** the inverse-patch reverts the merges, the change moves back to active, and the action is audit-logged

#### Scenario: Unrestorable due to later modification
- **WHEN** a later-archived change modified the same requirement UUID
- **THEN** restore enters the INV-4a "unrestorable" state with the reason recorded and the user is offered "restore as a new change instead"

#### Scenario: Archive preserves delta files
- **WHEN** a change is archived
- **THEN** the original delta spec files are preserved inside the archived folder
