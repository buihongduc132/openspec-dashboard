## ADDED Requirements

### Requirement: Append-only per-project audit log with SHA-256 hash chain
Every mutating canonical-artifact API call SHALL append an audit entry to a per-project append-only log. Each entry SHALL chain to the previous: `hash[n] = SHA256(hash[n-1] || canonical(entryBody[n]))`. The first entry chains to a fixed genesis hash. The `entryBody` schema SHALL be `{actor, action, entity, beforeHash, afterHash, timestamp (UTC, ms), requestId (UUID)}`.

#### Scenario: First entry chains to genesis
- **WHEN** the first mutating call for a project appends an audit entry
- **THEN** its `prevHash` equals the fixed genesis hash and its own hash is recomputable from the genesis hash + its canonical entryBody

#### Scenario: Subsequent entry chains to previous
- **WHEN** a second mutating call appends an entry after the first
- **THEN** its `prevHash` equals the first entry's hash and recomputation reproduces the stored hash

#### Scenario: Two same-body entries at different times remain distinct
- **WHEN** two entries have identical actor/action/entity/beforeHash/afterHash but different timestamps or requestIds
- **THEN** their hashes differ (timestamp + requestId participate in the hash)

### Requirement: Single-writer append queue per project
A per-project serial append queue SHALL ensure no two concurrent appends read the same `prevHash`. Concurrent mutating endpoints enqueue their audit record and the writer drains serially.

#### Scenario: Concurrent appends serialize
- **WHEN** two mutating endpoints append concurrently to the same project's log
- **THEN** the queue serializes them; the second append sees the first's hash as its `prevHash` and no entry is lost or written with a stale prevHash

#### Scenario: Queue survives process restart
- **WHEN** the process restarts mid-drain with one queued entry not yet flushed
- **THEN** on restart the log reflects a consistent chain (the unflushed entry is either present or absent, but the chain is never broken) — recovery re-reads the last persisted hash as the chain head

### Requirement: Tamper-detecting chain verifier
A chain verifier SHALL run on every read of the audit log AND as a scheduled job. It SHALL recompute each entry's hash from its `prevHash` + canonical `entryBody` and SHALL report the index and content of any entry whose stored hash does not match the recomputed value.

#### Scenario: Tampered entry detected
- **WHEN** an audit entry's `action` field is modified in place after being written
- **THEN** the verifier reports the tampered entry index and rejects the chain as invalid

#### Scenario: Deleted (missing) entry detected
- **WHEN** an entry is removed from the middle of the chain
- **THEN** the verifier reports the broken link (the entry after the gap has a `prevHash` that no longer matches any stored hash)

#### Scenario: Clean chain passes
- **WHEN** the verifier runs against an untouched chain
- **THEN** it reports the chain valid and records no findings

#### Scenario: Audit file missing on startup
- **WHEN** the server starts and the per-project audit file does not exist
- **THEN** the chain is initialized from the fixed genesis hash and the first subsequent mutation appends an entry chained to genesis

#### Scenario: Audit file partially written (mid-flush crash)
- **WHEN** the server crashes during an atomic append (temp file created but rename not completed)
- **THEN** on restart the temp file is detected, deleted, and the chain resumes from the last fully-persisted entry (no partial entries in the live log)

#### Scenario: Audit file unreadable (permission error, disk corruption)
- **WHEN** the audit file exists but cannot be read (permission denied, I/O error)
- **THEN** the server enters read-only quarantine immediately and surfaces an operator incident (the chain is unverified and cannot be trusted)

### Requirement: Read-only quarantine on chain break
On a detected chain break, the server SHALL enter read-only quarantine: mutating endpoints return 503, the broken entry is isolated, and the incident is surfaced to an operator. The server does NOT continue accepting mutations on a broken chain.

#### Scenario: Quarantine blocks mutations
- **WHEN** the scheduled verifier detects a broken chain
- **THEN** all subsequent mutating endpoints return 503 with a quarantine reason until an operator clears the quarantine

#### Scenario: Reads remain available during quarantine
- **WHEN** the server is in quarantine
- **THEN** read endpoints continue to serve (the break does not take the dashboard offline)

### Requirement: Audit-emission contract on mutating endpoints (NFR-10)
Every mutating endpoint SHALL emit an audit record. A contract test SHALL fail if any mutating endpoint does not emit.

#### Scenario: Contract test catches a missing emission
- **WHEN** a new mutating endpoint is added without emitting an audit record
- **THEN** the audit-emission contract test fails listing the offending route

#### Scenario: Phase-1-stand-in stub route satisfies the contract
- **WHEN** Phase 0 has no real feature mutating endpoints yet
- **THEN** a stand-in stub mutation route is provided so the middleware + emission contract is proven end-to-end before Phase 1 wires real endpoints

### Requirement: Filesystem chain is truth; Postgres `audit_logs` is a mirror
The per-project filesystem hash chain (per the requirements above) is the authoritative source of truth for the audit log. The existing `audit_logs` Postgres table (id, projectId, action, entityType, entityId, details, author, createdAt) SHALL be retained as a query/mirror surface for UI activity feeds and structured queries; it SHALL NOT be the source of truth for the chain. The Phase 0 audit-emission middleware SHALL write BOTH on every mutation: (1) the authoritative filesystem chain entry, and (2) a best-effort row into `audit_logs` with matching fields. On any conflict or verification gap between the two, the filesystem chain SHALL win and the Postgres row SHALL be treated as stale.

#### Scenario: Mutation writes to both chain and mirror
- **WHEN** a mutating endpoint runs and emits an audit record
- **THEN** an authoritative entry is appended to the filesystem chain AND a best-effort row with matching actor/action/entity/timestamp is inserted into `audit_logs`

#### Scenario: Mirror write fails but chain write succeeds
- **WHEN** the filesystem chain append succeeds but the Postgres mirror insert fails (e.g. transient DB error)
- **THEN** the mutation is NOT rolled back (the chain is authoritative and complete); the mirror miss is logged and the chain entry remains the verifiable record

#### Scenario: Conflict between chain and mirror resolves to chain
- **WHEN** the chain and the `audit_logs` table disagree on an entry (e.g. a mirror row was edited)
- **THEN** the filesystem chain is treated as truth and the Postgres row is treated as stale; the discrepancy is surfaced as a finding, not silently reconciled

### Requirement: One-time backfill of pre-existing `audit_logs` rows
A one-time Phase 0 cutover migration SHALL backfill every pre-existing `audit_logs` row into the filesystem chain, chained from genesis in `createdAt` order, so no prior history is lost at the cutover. The migration SHALL be idempotent (re-running it produces no duplicate chain entries) and SHALL be verified by the chain verifier after completion.

#### Scenario: Backfill chains pre-existing rows in order
- **WHEN** the Phase 0 cutover migration runs against a project that already has `audit_logs` rows
- **THEN** those rows are appended to the filesystem chain from genesis in ascending `createdAt` order and the chain verifier reports the resulting chain valid

#### Scenario: Backfill is idempotent
- **WHEN** the backfill migration runs a second time
- **THEN** no duplicate chain entries are created (already-backfilled rows are detected and skipped)

### Requirement: Retention via archive-then-delete (D-AuditRetention)
Retention expiry SHALL move entries to a cold archive (chain hash preserved) and then delete them from the live log. Right-to-erasure for a project SHALL archive that project's entire chain to offline storage and delete it from the live log; other projects' chains are untouched.

#### Scenario: Retention archive preserves chain verifiability
- **WHEN** entries older than the retention window expire
- **THEN** they are moved to a cold archive whose chain is independently verifiable and then deleted from the live log

#### Scenario: Per-project erasure does not touch siblings
- **WHEN** right-to-erasure is invoked for project X
- **THEN** project X's chain is archived + deleted and project Y's chain in the same deployment is byte-identical before and after
