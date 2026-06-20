## ADDED Requirements

### Requirement: Local project registration with path allowlist
The system SHALL register a local project by absolute `rootPath` and SHALL reject any path outside a configurable allowlist (default: the operator's home directory tree). Registration SHALL NOT clone or execute anything remote in Phase 0 (remote clone with full sandbox is Phase 0.3-tracked but its security sandbox is gated by the threat model; Phase 0 registers local paths only).

#### Scenario: Register an allowlisted local path
- **WHEN** an operator registers `/home/alice/myproject` and the allowlist permits `/home/alice/**`
- **THEN** the project is registered and its `openspec/` tree is watchable

#### Scenario: Reject a path outside the allowlist
- **WHEN** an operator registers `/etc` and the allowlist does not permit it
- **THEN** registration is rejected with a path-allowlist error and no watcher is started

#### Scenario: Reject a path-traversal attempt
- **WHEN** an operator registers `/home/alice/../../etc/secrets`
- **THEN** the resolved absolute path is computed and rejected against the allowlist (no traversal bypass)

### Requirement: Filesystem watcher rebuilds the projection within 2s (NFR-3)
The system SHALL watch the registered repo's `openspec/` tree and refresh the in-memory projection within 2 seconds of any disk change. The watcher SHALL debounce batch updates to avoid thrash on `git pull` touching many files, and SHALL survive file moves, deletes, and bulk git operations.

#### Scenario: Out-of-band edit is reconciled
- **WHEN** a user edits `tasks.md` in `$EDITOR` and saves
- **THEN** the projection reflects the new content within 2s without a server restart

#### Scenario: Bulk git operation does not crash the watcher
- **WHEN** a `git checkout` touches 200 files in `openspec/` at once
- **THEN** the watcher debounces, rebuilds the projection once, and does not throw or leave a stale projection

#### Scenario: Watcher self-write suppression
- **WHEN** the server performs an atomic write to a canonical file
- **THEN** the watcher ignores that write event (via an in-process marker) and does not trigger a redundant reconciliation

### Requirement: Atomic server-side writes (server → disk)
Every server-side mutation SHALL write the corresponding canonical file(s) atomically (write-temp + rename). A write failure SHALL roll back the in-memory projection and return a 5xx describing the partial state.

#### Scenario: Successful atomic write
- **WHEN** the server writes a new task line to `tasks.md`
- **THEN** the file is written to a temp file and renamed into place; a reader never observes a half-written file

#### Scenario: Write failure rolls back projection
- **WHEN** a rename fails (e.g. disk full or permission denied)
- **THEN** the in-memory projection is rolled back to its pre-write state and the caller receives a 5xx with a description of the unflushed partial state

### Requirement: Per-section ETag concurrency (INV-7)
The system SHALL enforce section-scoped optimistic concurrency on every mutating endpoint per the Section Granularity Table in `flow/requirements/README.md`. Two clients editing DIFFERENT sections of the same file SHALL both succeed. Two clients editing the SAME section SHALL resolve to a 409 on the second commit. ETag = `SHA256(sectionBytes ‖ monotonicVersion)`.

#### Scenario: Different sections both succeed
- **WHEN** client A edits task line 5 and client B edits task line 12 of the same `tasks.md`, each sending a valid `If-Match` for their own section
- **THEN** both writes succeed and neither receives a 409

#### Scenario: Same section conflict returns 409
- **WHEN** client A and client B both edit task line 5 starting from the same ETag and A commits first
- **THEN** B's commit returns 409 with the current ETag and a pointer to a merge UI (the merge UI itself is Phase 1.3; Phase 0 returns the 409 + ETag only)

#### Scenario: Missing If-Match on a mutation is rejected
- **WHEN** a PUT/PATCH/DELETE mutating request omits the `If-Match` header
- **THEN** the middleware rejects it with 428 Precondition Required before the handler runs

#### Scenario: POST create is exempt from If-Match
- **WHEN** a POST creates a new section that does not yet exist
- **THEN** no `If-Match` is required (the section has no prior ETag); an idempotency key is accepted instead

### Requirement: ETag monotonic version persists across restart
The per-section `monotonicVersion` counter (a component of the ETag per INV-7) SHALL persist across server restart so a client's previously-issued ETag remains valid after the server reboots. An in-memory-only counter would change every ETag on restart, silently invalidating all in-flight client edits (false 409s); this is a correctness hole, not an optimization. The counter SHALL be persisted to the sidecar (a single `etags.json` per project mapping `sectionKey → {version, hash}`) and reloaded on startup before any mutating endpoint is served.

#### Scenario: Restart preserves a client-issued ETag
- **WHEN** client A holds an ETag for task line 5, the server restarts, and client A then commits with that ETag
- **THEN** the ETag still matches (the monotonicVersion was persisted and reloaded) and the commit succeeds; the client does NOT receive a spurious 409

#### Scenario: Version file missing on startup
- **WHEN** the server starts and the per-project `etags.json` does not exist
- **THEN** ETags are re-derived from the current section bytes on disk with `monotonicVersion` reset to the genesis value (0), and any client holding a pre-restart ETag receives a 409 with the new ETag + merge UI pointer (honest invalidation, not silent corruption)

#### Scenario: Version file write is atomic
- **WHEN** the server bumps a section's version and writes `etags.json`
- **THEN** the write is atomic (temp + rename); a crash mid-bump leaves either the pre-bump or post-bump version file, never a partially-written one

### Requirement: Sidecar coexistence with upstream validate (req 08 §8.9 gate 1)
The dashboard-private sidecar location (default `openspec/.dashboard/`) SHALL be ignored by `openspec validate` as a binary success criterion: the directory is not traversed and produces zero validation findings. If this cannot be confirmed, the location constant SHALL atomically switch to the pre-committed fallback `<repo>/.openspec-dashboard/` and a written finding SHALL record the switch.

#### Scenario: Validate ignores sidecar
- **WHEN** `openspec validate` runs against a project whose `openspec/.dashboard/` contains sidecar files
- **THEN** the directory is not traversed and produces zero findings

#### Scenario: Fallback path switches atomically on gate failure
- **WHEN** gate 1 confirms the default sidecar location is NOT ignored
- **THEN** a single location constant switches every affected path (`openspec/.dashboard/` → `<repo>/.openspec-dashboard/`) atomically, a written finding is committed under `flow/findings/`, and no design amendment beyond the constant is needed
