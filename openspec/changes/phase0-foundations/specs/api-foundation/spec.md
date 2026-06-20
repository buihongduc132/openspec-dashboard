## ADDED Requirements

### Requirement: Health endpoint
The system SHALL expose `GET /health` returning HTTP 200 with a JSON body indicating service liveness and the version of the OpenSpec parser in use.

#### Scenario: Healthy service
- **WHEN** `GET /health` is called on a running, dependency-available service
- **THEN** it returns 200 with `{status: "ok", parserVersion, timestamp}`

#### Scenario: Health degrades gracefully on a watcher failure
- **WHEN** the filesystem watcher for a registered project has died
- **THEN** `/health` still returns 200 but includes a `degraded` indicator listing the unhealthy watcher, rather than reporting fully ok

### Requirement: Read-only project, spec, and change list endpoints
The system SHALL expose `GET /projects` (list registered projects), `GET /projects/:id/specs` (list spec domains + specs for a project), and `GET /projects/:id/changes` (list changes for a project) returning JSON read from the in-memory projection.

#### Scenario: List projects
- **WHEN** `GET /projects` is called after two projects are registered
- **THEN** it returns 200 with a JSON array of both projects' metadata

#### Scenario: Unknown project returns 404
- **WHEN** `GET /projects/<nonexistent-id>/specs` is called
- **THEN** it returns 404 with a JSON error body identifying the missing project

#### Scenario: Reads reflect out-of-band disk edits
- **WHEN** a spec file is edited on disk and the watcher rebuilds the projection
- **THEN** the next `GET /projects/:id/specs` reflects the new content without a server restart

### Requirement: OpenAPI 3.1 generation
The system SHALL generate an OpenAPI 3.1 document covering all exposed endpoints and SHALL version it. A breaking API change SHALL bump the major version.

#### Scenario: OpenAPI document validates
- **WHEN** the generated OpenAPI document is validated against the OpenAPI 3.1 schema
- **THEN** validation passes with no errors

#### Scenario: New endpoint appears in the document
- **WHEN** a new read endpoint is added
- **THEN** the regenerated OpenAPI document includes it with request/response schemas
