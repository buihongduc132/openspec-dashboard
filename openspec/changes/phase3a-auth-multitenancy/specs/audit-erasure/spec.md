## ADDED Requirements

### Requirement: Per-project right-to-erasure
The system SHALL support a per-project right-to-erasure that archives the project's dashboard-owned metadata and audit partition to offline storage (chain hash preserved for compliance), then deletes them from the live system within 30 days of the request. Canonical OpenSpec artifacts SHALL NEVER be touched by erasure.

#### Scenario: Erasure request honored
- **WHEN** a project erasure is requested
- **THEN** the project's dashboard-owned metadata and its per-project audit partition are archived (chain hash preserved) and deleted from the live system within 30 days

#### Scenario: Canonical artifacts untouched
- **WHEN** an erasure runs on a project
- **THEN** no file under the project's canonical `openspec/` tree (`openspec/specs/`, `openspec/changes/`, `openspec/schemas/`, `openspec/config.yaml`) is modified or deleted

#### Scenario: Other projects' audit chains untouched
- **WHEN** project P is erased
- **THEN** the audit chains of every other project remain intact and independently verifiable

### Requirement: Archive-and-delete, not crypto-shred
Erasure SHALL use archive-and-delete per D-AuditRetention: entries move to a cold archive (chain hash preserved for compliance) then are deleted from the live log. No partial-row crypto-shred is used.

#### Scenario: Cold archive chain verifiable
- **WHEN** erasure archives a project's audit chain to cold storage
- **THEN** the archived chain remains independently verifiable via its chain hash

### Requirement: Tracked deletion completion
A deletion request SHALL be logged and tracked to completion. Backups SHALL honor the same deletion window.

#### Scenario: Deletion tracked to completion
- **WHEN** a deletion request is created
- **THEN** it is tracked from request through completion and the completion is recorded

#### Scenario: Backup honors deletion window
- **WHEN** a backup is taken after a deletion completes
- **THEN** the backup does not restore the erased dashboard metadata within the deletion window (or the backup itself is aged out within the window)

### Requirement: Erasure authorization
Only the project **Owner** or an **admin** SHALL be permitted to request a project erasure. Requests from any other user SHALL be rejected with `403`; unauthenticated requests SHALL be rejected with `401`. Every erasure request and its outcome SHALL be audit-logged with the requesting actor.

#### Scenario: Owner requests erasure
- **WHEN** the project Owner or an admin requests erasure of project P
- **THEN** the erasure request is accepted, recorded with the requesting actor, and tracked to completion

#### Scenario: Non-owner request rejected
- **WHEN** a Viewer or Editor on project P requests erasure of P
- **THEN** the request is rejected with `403` and no erasure begins

#### Scenario: Unauthenticated erasure request rejected
- **WHEN** an unauthenticated request (in multi-user mode) requests erasure
- **THEN** the request is rejected with `401`

### Requirement: Concurrency with in-flight writes
While an erasure for project P is in progress, any new mutating request against P SHALL be rejected with `409` (or queued behind the erasure) and SHALL NOT be silently lost or applied to already-archived data. Once the erasure completes, subsequent writes to P are impossible (the project's dashboard data is gone); the project must be re-registered to accept new data.

#### Scenario: Write during erasure is rejected
- **WHEN** a mutating request arrives for project P while P's erasure is mid-flight
- **THEN** the request is rejected with `409` (or queued) and is not applied to archived data

#### Scenario: Write after erasure is impossible
- **WHEN** a mutating request arrives for project P after its erasure completed
- **THEN** the request is rejected because the project's dashboard metadata no longer exists (re-registration required to resume)
