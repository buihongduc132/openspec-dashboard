## ADDED Requirements

### Requirement: Reference payload structure
The system SHALL produce a reference payload for any supported entity that contains, at minimum, the fields: `type` (entity kind), `title` (human-readable heading), `path` (absolute filesystem path or best-available location pointer), `id` (stable identifier), `metadata` (status, owner, timestamps, and key relationships relevant to the entity kind), and `readInstruction` (a plain-English line telling an AI agent which file(s) to read and what to do).

#### Scenario: Task reference payload fields
- **WHEN** a reference is generated for a task entity
- **THEN** the payload `type` is `task`, `title` is the task title, `path` points to the task's source location (change `tasks.md` within the project root when resolvable), `metadata` includes `taskNumber`, `status`, `assignee`, `priority`, `dueDate`, `changeName`, and `projectName`, and `readInstruction` names the tasks file to read

#### Scenario: Unknown metadata fields are omitted, not null
- **WHEN** an entity has no value for an optional metadata field (e.g. a task with no assignee)
- **THEN** that field key is omitted from the `metadata` object rather than serialized as `null`

#### Scenario: Absolute path uses configured repo root
- **WHEN** a reference is generated and the entity resolvable to a filesystem location
- **THEN** the `path` is an absolute path formed by joining the configured repo root base with the entity's relative location, never a relative path

### Requirement: Supported entity types
The system SHALL support reference generation for at least these entity types: `project`, `change`, `spec`, `spec-domain`, `requirement`, `task`, `schema`, `context-store`, `workspace`, and `initiative`.

#### Scenario: Generating a reference for each supported type
- **WHEN** a reference is requested for any of the supported entity types by id
- **THEN** the system returns a payload with the correct `type` and type-appropriate metadata without error

#### Scenario: Unsupported entity type is rejected
- **WHEN** a reference is requested for an entity type not in the supported list
- **THEN** the system returns a 400 error identifying the unsupported type

### Requirement: Copy format selection
The system SHALL offer the reference payload in at least two copy formats: a compact **markdown** block suitable for pasting into chat, and a **JSON** object suitable for programmatic or tool input. The user SHALL be able to choose the format before copying.

#### Scenario: Copy as markdown
- **WHEN** the user selects the markdown format and triggers copy
- **THEN** the clipboard contains a fenced markdown block with the entity type as a heading, the title, a metadata list, the absolute path, and the read instruction as plain text

#### Scenario: Copy as JSON
- **WHEN** the user selects the JSON format and triggers copy
- **THEN** the clipboard contains a single valid JSON object matching the payload structure with no trailing prose

### Requirement: Reference API endpoint
The system SHALL expose a read-only GET endpoint `/api/reference/{type}/{id}` that resolves an entity by type and id and returns its full reference payload as JSON. The endpoint SHALL return 404 when the entity does not exist and 400 for an unsupported type.

#### Scenario: Successful resolution
- **WHEN** a GET request hits `/api/reference/task/{validId}`
- **THEN** the response is HTTP 200 with a JSON body matching the reference payload structure

#### Scenario: Missing entity
- **WHEN** a GET request hits `/api/reference/task/{nonexistentId}`
- **THEN** the response is HTTP 404 with a JSON error body identifying the missing entity

#### Scenario: Unsupported type
- **WHEN** a GET request hits `/api/reference/unsupportedType/{id}`
- **THEN** the response is HTTP 400 with a JSON error body listing the supported types

### Requirement: Copy affordance on every entity surface
The system SHALL surface a "Copy reference" affordance on every entity detail view and entity list row across the dashboard, including the kanban task dialog, project detail header, change detail header, spec domain detail, and list pages for projects, changes, specs, schemas, context stores, workspaces, and initiatives.

#### Scenario: Copy button on kanban task dialog
- **WHEN** a user opens a task in the kanban dialog
- **THEN** a "Copy reference" control is visible inside the dialog

#### Scenario: Copy button on project list row
- **WHEN** a user views the projects list
- **THEN** each project row exposes a "Copy reference" control that copies that project's reference

#### Scenario: Copy button on change detail header
- **WHEN** a user views a change detail page
- **THEN** the change header exposes a "Copy reference" control that copies that change's reference

### Requirement: Clipboard fallback
The system SHALL provide a working copy path when the async Clipboard API is unavailable or rejected, by presenting the payload in a selectable textarea with a "Select all" affordance so the user can copy manually.

#### Scenario: Clipboard API unavailable
- **WHEN** `navigator.clipboard.writeText` is undefined or rejects
- **THEN** the system displays the payload in a focusable textarea, selects its contents, and shows guidance to press the copy shortcut, rather than failing silently

### Requirement: Copy confirmation
The system SHALL give immediate non-blocking confirmation when a copy succeeds, via a transient toast or inline state change on the copy control, without navigating away or reloading.

#### Scenario: Successful copy feedback
- **WHEN** a copy operation completes successfully
- **THEN** a toast or inline "Copied" state appears within 200ms and auto-dismisses within 4 seconds

#### Scenario: Failed copy feedback
- **WHEN** a copy operation fails and the fallback is shown
- **THEN** the UI indicates the fallback path is active and does not claim success

### Requirement: Path resolution per entity kind
The system SHALL resolve a location pointer per entity kind using existing data: `project` uses its `rootPath`; `change` uses `<project rootPath>/openspec/changes/<change name>`; `task` uses `<project rootPath>/openspec/changes/<change name>/tasks.md`; `spec-domain` uses `<project rootPath>/openspec/specs/<domain name>`; `requirement` uses its parent spec-domain path with an anchor to the requirement title. Kinds with no natural file location (e.g. `schema`, `workspace`) SHALL carry a `path` describing their logical location and a `readInstruction` explaining how to retrieve them.

#### Scenario: Task path resolves into the change's tasks file
- **WHEN** a task belongs to a change that belongs to a project with a known rootPath
- **THEN** the resolved `path` is `<rootPath>/openspec/changes/<changeName>/tasks.md` and the `readInstruction` references the task number

#### Scenario: Entity with no file location
- **WHEN** a reference is generated for a `schema` entity
- **THEN** the `path` describes the logical location (e.g. `dashboard://schema/<id>`) and `readInstruction` explains the schema is stored in the dashboard database, not a file
