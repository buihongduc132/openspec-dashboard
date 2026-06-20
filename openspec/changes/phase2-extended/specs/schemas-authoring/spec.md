## ADDED Requirements

### Requirement: Schema creation
The system SHALL let the user create a new custom schema (project-local by default): name, version, description, and an artifact list. Each artifact SHALL define `generates`, `requires`, `apply.requires`, `apply.tracks`, and a template path. The system SHALL validate that there are no circular `requires` dependencies, all template paths exist (or will be created), and artifact IDs are unique and kebab-case. Schema creation SHALL scaffold the schema directory and template files from a starter template.

#### Scenario: Circular requires rejected
- **WHEN** a user defines a schema where artifact A requires B and B requires A
- **THEN** creation is rejected with an error naming the cycle; no files are written

#### Scenario: Non-kebab artifact ID rejected
- **WHEN** a user names an artifact "Proposal Doc"
- **THEN** creation is rejected and the user is asked for a kebab-case ID

#### Scenario: Scaffold from starter
- **WHEN** a user creates a valid schema
- **THEN** the schema directory and template files are scaffolded and immediately pass schema validation

### Requirement: Schema forking with dashboard-side provenance
The system SHALL let the user fork an existing schema (built-in or user-level) into a project-local copy for customization. Fork provenance (forked-from name + version + fork timestamp) SHALL be recorded in dashboard-side metadata (`openspec/.dashboard/schema-forks.json`), NOT as an invented upstream `forked_from` YAML key. A "Diff against upstream" action SHALL show what the fork changed (file-level diff) using the recorded source.

#### Scenario: Fork records provenance in sidecar
- **WHEN** a user forks the built-in `spec-driven` schema
- **THEN** a project-local copy is created and `openspec/.dashboard/schema-forks.json` records the source name, version, and timestamp; the canonical `schema.yaml` contains no invented `forked_from` key

#### Scenario: Diff against upstream
- **WHEN** a user forks a schema, edits a template, then runs "Diff against upstream"
- **THEN** the view shows a file-level diff of the fork versus the recorded source

#### Scenario: Fork a missing source
- **WHEN** a user attempts to fork a schema name that does not resolve in any layer
- **THEN** the operation fails with a 404 and a resolution-debug suggestion

### Requirement: Template management
The system SHALL let the user edit artifact templates (Markdown files) per schema artifact, with a preview that renders the template with sample variables injected. The editor SHALL provide template-variable autocomplete for `{{name}}`, `{{context.*}}`, and `{{date}}`. The preview SHALL use the current project's context block from `config.yaml`.

#### Scenario: Variable autocomplete
- **WHEN** a user types `{{` in a template editor
- **THEN** autocomplete offers `name`, `context.*`, and `date`

#### Scenario: Preview with project context
- **WHEN** a user previews a template that references `{{context.area}}`
- **THEN** the preview renders using the current project's context block value for `area`

#### Scenario: Preview a template with an undefined variable
- **WHEN** a user previews a template referencing `{{context.missing}}`
- **THEN** the preview renders the variable as a visible placeholder rather than crashing

### Requirement: Schema activation
The system SHALL let the user set a schema as the project default by writing `config.yaml`'s default-schema key. Switching schemas SHALL warn about in-flight changes authored under the previous schema. Switching SHALL NOT mutate existing changes; it SHALL affect only new change creation. Per-change schema override (in `.openspec.yaml`) SHALL be respected and surfaced.

#### Scenario: Switch warns about in-flight changes
- **WHEN** a user switches the default schema while two changes are in-flight under the old schema
- **THEN** a warning lists those changes; confirming the switch does not mutate them

#### Scenario: Per-change override respected
- **WHEN** a change's `.openspec.yaml` sets a schema different from the project default
- **THEN** that change uses its override and the UI surfaces the override clearly

#### Scenario: Switch does not retroactively change existing changes
- **WHEN** a user switches the default schema
- **THEN** existing changes' `.openspec.yaml` schema fields are untouched

### Requirement: Schema export and import
The system SHALL export a schema (definition + templates) as a tarball including a manifest with schema version and fork provenance (dashboard-side). The system SHALL import a schema tarball into the project-local layer, validating before writing, atomically (all-or-nothing), with a name-collision prompt.

#### Scenario: Export includes manifest
- **WHEN** a user exports a forked schema as a tarball
- **THEN** the tarball includes the schema definition, templates, and a manifest recording schema version and fork provenance

#### Scenario: Atomic import on validation failure
- **WHEN** a user imports a tarball whose schema fails validation
- **THEN** no files are written and the project-local schema layer is unchanged

#### Scenario: Name-collision prompt
- **WHEN** a user imports a tarball whose schema name already exists in the project-local layer
- **THEN** the system prompts for rename/overwrite/skip before writing anything
