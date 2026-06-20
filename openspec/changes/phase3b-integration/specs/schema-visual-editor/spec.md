## ADDED Requirements

### Requirement: Two-pane visual and YAML editor with two-way binding
The system SHALL provide a schema editor with two panes: a visual form (artifact list with dependency picker, template selector, apply flags) and a raw `schema.yaml` editor with live validation. The two panes SHALL be two-way bound: editing the visual form updates the YAML, and editing the YAML updates the visual form. This satisfies req 05.5 / D-SchemaEditor (deferred from Phase 2).

#### Scenario: Visual edit updates YAML
- **WHEN** a user edits an artifact's apply flag in the visual form
- **THEN** the YAML pane updates to reflect the change in real time

#### Scenario: YAML edit updates visual form
- **WHEN** a user edits the `schema.yaml` text in the YAML pane
- **THEN** the visual form updates to reflect the parsed change in real time

### Requirement: Out-of-band edit conflict detection
The system SHALL detect when the underlying `schema.yaml` is edited out-of-band (e.g. via `$EDITOR` or git pull) while the editor is open. The system SHALL warn the user and offer to reload, rather than silently overwriting the external change. This honors INV-7 (optimistic concurrency) at the whole-file granularity (schema files are whole-file per the Section Granularity Table).

#### Scenario: Out-of-band edit detected
- **WHEN** the schema file changes on disk while the editor pane is open
- **THEN** the system warns the user and offers to reload the file from disk

#### Scenario: User overwrites with stale ETag
- **WHEN** a user submits a schema save with a stale `If-Match` ETag (the file changed since they loaded it)
- **THEN** the system rejects the save with 409 and offers the merge/reload UI

### Requirement: Round-trip safety for YAML-only keys
The system SHALL preserve YAML keys that are not surfaced in the visual form verbatim across round-trips. Editing via the visual form SHALL NOT drop or reorder YAML-only keys. This honors INV-2 (region-scoped byte fidelity) for schema files.

#### Scenario: Visual edit preserves unknown keys
- **WHEN** a user edits an artifact in the visual form and the YAML contains keys not surfaced in the form
- **THEN** the save preserves those unknown keys verbatim

#### Scenario: YAML save preserves comments and ordering
- **WHEN** a user edits the YAML text and saves
- **THEN** the save preserves YAML comments and key ordering outside the edited region (byte-fidelity for untouched regions)

### Requirement: Live validation in the editor
The system SHALL validate the schema against the schema definition rules (req 05.2) live as the user edits, surfacing validation errors inline in both panes. The save action SHALL be blocked while validation errors exist (INV-6: validation before write).

#### Scenario: Live validation shows error inline
- **WHEN** a user types invalid YAML or a schema rule violation
- **THEN** the system shows the error inline in the editor in real time

#### Scenario: Save blocked on validation error
- **WHEN** a user attempts to save while validation errors exist
- **THEN** the system blocks the save and highlights the errors

### Requirement: Visual editor respects whole-file ETag concurrency
Schema files are whole-file single-writer (per the Section Granularity Table). The visual editor save SHALL send an `If-Match` ETag covering the whole file. Concurrent edits to the same schema file by two users SHALL be rejected for the second writer with a 409 and the merge/reload UI.

#### Scenario: Concurrent schema edits
- **WHEN** two users edit the same schema file and both attempt to save
- **THEN** the first save succeeds and the second is rejected with 409 and offered the merge/reload UI
