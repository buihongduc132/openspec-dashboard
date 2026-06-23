## ADDED Requirements

### Requirement: Project registration

The dashboard SHALL register OpenSpec repositories as projects. Each project
records a root path (or sandboxed clone path), a default schema, optional
context metadata, and a stable internal UUID. Registration MUST NOT mutate the
target repository until the user explicitly enables sync.

Source: req 01 §1.1–1.3.

#### Scenario: Register a local OpenSpec repo

- **WHEN** a user submits the new-project form with name, root path, and
  default schema
- **THEN** a project row is created with a UUID, the root path is recorded,
  `POST /api/projects` returns 201 with the new project, and the target
  repository is NOT modified.

#### Scenario: Reject duplicate project name

- **WHEN** a user submits a project name that already exists
- **THEN** the API returns 409 and no row is created.

### Requirement: Sandboxed clone (M-7 hardened)

When a project points at a remote/foreign repository, the dashboard SHALL
materialize a sandboxed clone under `openspec/.dashboard/sandboxes/<uuid>/`
with `core.hooksPath` disabled, `--filter=blob:none` for submodules, and no
automatic checkout of untrusted branches. The clone is the only path the
projection layer reads from.

Source: req 01 §1.6, plan §0.1.

#### Scenario: Clone with hooks disabled

- **WHEN** a project registers a remote URL
- **THEN** the sandboxed clone is created with `core.hooksPath=/dev/null`,
  submodule recursion uses `--filter=blob:none`, and no post-checkout hook
  from the upstream repo executes.

### Requirement: Config editor

The dashboard SHALL expose project config (`openspec/config.yaml`,
`.openspec.yaml`) for editing with validation against the upstream schema.
Edits are single-writer (whole-file ETag, INV-7) and audit-logged.

Source: req 01 §1.5.

#### Scenario: Edit config with ETag

- **WHEN** a user edits project config and submits with a stale `If-Match`
- **THEN** the API returns 412 and the current ETag, and no write occurs.
