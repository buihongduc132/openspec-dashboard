## ADDED Requirements

### Requirement: Project read endpoints SHALL expose projection status fields
`GET /api/projects` and `GET /api/projects/:id` SHALL include in each project object the fields `projected` (boolean), `lastProjectedAt` (ISO 8601 string or null), and `parseErrors` (array of parse-issue objects, possibly empty). Each parse-issue object SHALL contain `file` (path relative to the project root), `line` (1-based integer when known, else omitted), `severity` (`"warn" | "error"`), and `message` (human-readable string). Remote-git and un-projected projects SHALL report `projected=false`, `lastProjectedAt=null`, and an empty `parseErrors` array.

#### Scenario: Freshly projected local project
- **WHEN** a local project has just finished a successful projection with zero parse issues
- **THEN** the project object SHALL have `projected=true`, a non-null ISO 8601 `lastProjectedAt`, and `parseErrors: []`

#### Scenario: Project with two parse warnings
- **WHEN** the most recent projection recorded two `warn`-severity issues for `specs/auth/spec.md` line 12 and `changes/add-x/tasks.md`
- **THEN** the `parseErrors` array SHALL contain two objects matching those file/line/severity values, in the order they were recorded

### Requirement: A dedicated status endpoint SHALL return detailed projection state
`GET /api/projects/:id/projection-status` SHALL return a JSON object with `projectId`, `projected`, `lastProjectedAt`, `currentJob` (an object with `jobId`, `status` (`"queued" | "running" | "idle" | "failed"`), and `startedAt` when a job is active, else `null`), and `parseErrors` (the same array shape as the project endpoint). A request for a non-existent project SHALL return 404. A request for a remote-git project SHALL return 200 with `projected=false` and a `currentJob` of `null`.

#### Scenario: Status while a job is running
- **WHEN** a projection job is in-flight for a project
- **THEN** the endpoint SHALL return `currentJob.status: "running"` with a non-null `jobId` and `startedAt`

#### Scenario: Status for unknown project
- **WHEN** the path parameter id does not match any project
- **THEN** the endpoint SHALL return HTTP 404 with an `{ error }` body

#### Scenario: Status for idle freshly projected project
- **WHEN** the project has `projected=true` and no job is in-flight
- **THEN** `currentJob` SHALL be `null`, `projected` SHALL be `true`, and `lastProjectedAt` SHALL be non-null
