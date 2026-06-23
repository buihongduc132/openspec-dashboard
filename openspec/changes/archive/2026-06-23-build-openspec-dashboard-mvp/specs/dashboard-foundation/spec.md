## ADDED Requirements

### Requirement: OpenSpec parser port

The dashboard SHALL ship a TypeScript port of the upstream OpenSpec parser
(rules documented in req 08 §8.9) that produces a stable in-memory model of
specs, changes, artifacts, deltas, and tasks. Any upstream-format rule not
covered MUST be recorded in a gap registry (NFR-5) rather than silently
mishandled.

Source: req 08 §8.9, plan §0.2.

#### Scenario: Parse a valid spec tree

- **WHEN** the parser runs against a project with `openspec/specs/<domain>/spec.md`
  and `openspec/changes/<change>/`
- **THEN** it returns structured specs, requirements, scenarios, changes,
  artifacts, delta specs, and tasks without throwing.

#### Scenario: Record unsupported upstream format

- **WHEN** the parser encounters an upstream construct outside its documented
  rules (e.g. a new frontmatter key)
- **THEN** it records the construct in the gap registry and continues parsing
  the rest of the tree instead of crashing.

### Requirement: Filesystem projection with atomic writes

The dashboard SHALL project the parsed model back to the filesystem using
atomic writes (write-to-temp + rename) and per-section ETags (INV-7). Two
users editing different sections of the same file MUST both succeed; two
users editing the SAME section get a 409 + merge UI.

Source: req 01 §1.4, INV-7.

#### Scenario: Concurrent edits to different sections succeed

- **WHEN** user A edits task line 5 and user B edits task line 12 of the same
  `tasks.md`, both with valid `If-Match` for their respective sections
- **THEN** both writes succeed and neither user receives a 409.

#### Scenario: Concurrent edits to the same section conflict

- **WHEN** user A and user B both edit task line 5 with the same starting ETag
- **THEN** the second commit returns 409 and a 3-way merge UI is offered.

### Requirement: Audit hash-chain

The dashboard SHALL append every state-changing operation to a per-project
append-only audit log whose entries form a SHA-256 hash-chain
(`hash[n] = SHA256(hash[n-1] || canonical(entry[n]) || monotonicArchiveSeq)`).
A chain verifier MUST detect tampering or gaps (NFR-10). Archive sequence
numbers are monotonic and never reused (D-ArchiveSeq).

Source: req 09 §9.6, NFR-10, plan §0.4.

#### Scenario: Detect tampered audit entry

- **WHEN** an audit entry is modified in place after being written
- **THEN** the chain verifier reports the tampered entry index and rejects
  the chain as invalid.

#### Scenario: Erasure preserves chain integrity

- **WHEN** right-to-erasure archives a project's audit chain (D-AuditRetention)
- **THEN** the archived chain remains independently verifiable and other
  projects' chains are untouched.
