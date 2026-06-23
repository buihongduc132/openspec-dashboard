## ADDED Requirements

### Requirement: Projection SHALL walk an enrolled local project's openspec tree and upsert rows
The `projectProject(projectId)` function SHALL, for a project whose `enrollmentSource` is `local` and whose `rootPath` exists and is a directory, walk `<rootPath>/openspec/` and upsert parsed artifacts into the `specDomains`, `specs`, `requirements`, `scenarios`, `changes`, `artifacts`, `deltaSpecs`, and `tasks` tables. The capability name for a main spec SHALL be the directory name of `openspec/specs/<capability>/spec.md`. A change name SHALL be the directory name under `openspec/changes/<name>/` (excluding `archive`), with archived changes discovered under `openspec/changes/archive/<dated-name>/` and marked `archived`.

#### Scenario: Project with one capability and one active change
- **WHEN** `projectProject` runs against a project whose `openspec/specs/auth/spec.md` defines two requirements and whose `openspec/changes/add-login/` has a proposal, tasks (3 items, 1 checked), and a delta spec adding one requirement
- **THEN** after projection the DB SHALL contain one `specDomains` row (capability `auth`) with two `requirements` rows, one `changes` row (`add-login`, `archived=false`) with three `tasks` rows (one checked) and one `deltaSpecs` row, and `projects.projected` SHALL be `true`

#### Scenario: Project whose rootPath does not exist
- **WHEN** `projectProject` runs against a project whose `rootPath` is a deleted directory
- **THEN** it SHALL record a `projectionError` on the project stating the root is missing, SHALL set `projected=false`, and SHALL NOT throw

### Requirement: Projection SHALL be incremental via content hashing
Each content row upserted by projection SHALL carry a `contentHash` equal to the SHA-256 of the canonicalized source bytes (normalized line endings). On a subsequent projection run, a file whose computed hash matches the stored hash of its existing rows SHALL be skipped — its rows SHALL NOT be deleted, reinserted, or updated. `projects.lastProjectedAt` SHALL be advanced to the run's completion timestamp on every successful run.

#### Scenario: Unchanged file on second run
- **WHEN** a project is projected a second time and a `spec.md` file's bytes are identical to the first run
- **THEN** no UPDATE or DELETE SHALL be issued against that file's rows, and `lastProjectedAt` SHALL advance

#### Scenario: Edited file on second run
- **WHEN** a requirement block's body text changes between runs
- **THEN** the corresponding `requirements` row SHALL be updated with the new body and a new `contentHash`, and other unchanged rows for the same file SHALL be skipped

### Requirement: Projection SHALL remove rows whose source files disappeared
For each artifact kind, projection SHALL delete rows belonging to source files that no longer exist on disk (e.g. a capability directory deleted, a change archived or removed), so the DB reflects deletions. Deletions and upserts for a given (project, artifact-kind) pair SHALL occur within a single database transaction.

#### Scenario: Capability directory deleted between runs
- **WHEN** `openspec/specs/legacy/` is removed and the project is re-projected
- **THEN** the `specDomains`, `specs`, `requirements`, and `scenarios` rows whose capability was `legacy` SHALL be deleted

#### Scenario: Transactional isolation per kind
- **WHEN** projection is mid-upsert for `requirements` of capability `auth` and a concurrent read queries requirements for capability `billing`
- **THEN** the billing read SHALL not see a partial/intermediate state, because deletes+upserts are scoped per (project, kind) transaction

### Requirement: Manual re-project endpoint SHALL be non-blocking
`POST /api/projects/:id/project` SHALL enqueue a projection job and return HTTP 202 with a job identifier, SHALL NOT run the projection synchronously in the request handler, and SHALL coalesce concurrent requests for the same project into a single in-flight job. The response body SHALL include `{ jobId, status: "queued" | "running", projectId }`.

#### Scenario: Concurrent re-project requests coalesce
- **WHEN** two `POST /api/projects/:id/project` requests arrive for the same project while a projection is already running
- **THEN** both SHALL return 202 with the same `jobId`, and only one projection SHALL execute

#### Scenario: Re-project for a remote-git project
- **WHEN** `POST /api/projects/:id/project` is called for a project whose `enrollmentSource` is `remote-git`
- **THEN** the endpoint SHALL return 409 with an error explaining remote projects are not projected until git integration lands, and SHALL NOT enqueue a job

### Requirement: A chokidar watcher SHALL keep projection fresh per local project
The system SHALL start a chokidar watcher on `<rootPath>/openspec/**/*` the first time a local project is projected, store it keyed by projectId in a module-level registry, debounce file events by 500ms, and trigger an incremental projection on debounced change. The watcher SHALL ignore the dashboard's own writes. On project deletion, the watcher SHALL be closed and removed from the registry. The number of concurrently open watchers SHALL be capped (default 50); attempting to exceed the cap SHALL log a warning and fall back to manual re-project only.

#### Scenario: File edit triggers re-projection after debounce
- **WHEN** a requirement body in `openspec/specs/auth/spec.md` is edited on disk
- **THEN** within 500ms of the last write event the watcher SHALL trigger an incremental projection, and the DB row SHALL reflect the new body

#### Scenario: Project deletion closes its watcher
- **WHEN** a project is deleted via `DELETE /api/projects/:id`
- **THEN** its chokidar watcher SHALL be closed and removed from the registry, and no further events for that root SHALL fire

### Requirement: On startup the system SHALL sweep stale projections
When the server process starts, the system SHALL identify local projects where `projected` is false OR `lastProjectedAt` is older than the newest file mtime under `<rootPath>/openspec/`, and enqueue a background projection for each, without blocking request handling.

#### Scenario: Newly enrolled project after restart
- **WHEN** the server restarts and a local project has `projected=false`
- **THEN** the startup sweep SHALL enqueue a projection for it within the first request lifecycle, and the projection SHALL run off-thread
