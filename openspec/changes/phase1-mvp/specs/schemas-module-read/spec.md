## ADDED Requirements

### Requirement: Three-layer schema listing
The system SHALL list every resolvable schema from all three layers: built-in, user-level (`~/.local/share/openspec/schemas/`), and project-local (`openspec/schemas/`). Each entry SHALL show: name, version, source layer, artifact count, and an "active" badge if set as the project default. Resolution precedence (project → user → built-in) SHALL be displayed.

#### Scenario: Listing schemas across layers
- **WHEN** a project has one built-in schema, one user-level fork, and one project-local schema
- **THEN** all three appear with their respective source layer labels and precedence ordering

#### Scenario: Active badge on default schema
- **WHEN** the project default schema is set to "spec-driven"
- **THEN** that schema's entry shows an "active" badge

#### Scenario: Schema not found in any layer
- **WHEN** `config.yaml` references a schema name not present in any layer
- **THEN** the listing shows a "missing" indicator with the expected paths checked

### Requirement: Schema detail view with DAG and template preview
The system SHALL render a schema's definition: name, version, description, artifact list with `generates` / `requires` / `apply.requires` / `apply.tracks`, plus a visual DAG of artifact dependencies. The DAG SHALL use the same visual style as the change-artifact DAG for consistency. Each artifact SHALL have a template file preview (rendered Markdown).

#### Scenario: DAG renders artifact dependencies
- **WHEN** a schema has 3 artifacts where B requires A and C requires B
- **THEN** the DAG shows A → B → C with the dependency edges

#### Scenario: Template preview renders Markdown
- **WHEN** a user clicks an artifact in the DAG
- **THEN** the template file for that artifact is rendered as Markdown

#### Scenario: Schema with no artifacts
- **WHEN** a schema has zero artifacts
- **THEN** the detail view renders an empty state without error

### Requirement: Schema validation with report findings (read-only)
The system SHALL validate a schema: no circular deps, all template files exist, artifact IDs valid (unique, kebab-case), YAML syntactically valid, and `apply.tracks` references real artifact IDs. Validation SHALL be surfaced inline (per-artifact) and as a report. Validation is read-only in Phase 1 — no fixes are applied, no files are created. Schema mutation endpoints (create, fork, template management, activation) are Phase 2 (req 5.3/5.4/5.6/5.8) and are hard-blocked at the route layer (405 on POST/PUT/DELETE) per D-P1-7.

#### Scenario: Circular dependency detected
- **WHEN** artifact A requires B and B requires A
- **THEN** validation reports a circular dependency error

#### Scenario: Missing template file
- **WHEN** an artifact's template path does not exist
- **THEN** validation reports the missing file; no file is created (validation is read-only in Phase 1)

#### Scenario: Invalid artifact ID
- **WHEN** an artifact ID is not kebab-case or duplicates another
- **THEN** validation reports the issue inline on the offending artifact

### Requirement: Schema resolution debug with layer trace
The system SHALL show, for any schema reference, the full resolution path (project → user → built-in) and which layer actually served the schema. The resolution log SHALL show each candidate path with hit/miss status. A "Why not my fork?" diagnostic SHALL provide actionable suggestions for common misconfigurations (typo, wrong layer, version mismatch).

#### Scenario: Resolution trace shows serving layer
- **WHEN** a project-local schema "spec-driven" exists
- **THEN** the resolution trace shows: project-local hit, user-level miss (or skipped), built-in miss (or skipped)

#### Scenario: "Why not my fork?" diagnostic
- **WHEN** a user has a fork but the project resolves to the built-in schema
- **THEN** the diagnostic suggests checking the fork name, layer location, and config.yaml default-schema key

#### Scenario: Schema not found anywhere
- **WHEN** no layer serves the requested schema
- **THEN** the resolution log shows all three layers as miss with the checked paths
