## ADDED Requirements

### Requirement: Agent-friendly JSON read endpoints
The system SHALL expose JSON endpoints optimized for AI agent consumption: read project state (changes, specs, tasks summary) and read a change's full context (proposal, design, specs, tasks). Responses SHALL be dense JSON with no HTML and no pagination artifacts (agents receive complete documents in a single response).

#### Scenario: Read project state
- **WHEN** an agent requests project state with a valid scoped token
- **THEN** the system returns a single dense JSON document with the project's changes, spec domains, and task summary

#### Scenario: Read change full context
- **WHEN** an agent requests a change's full context with a valid scoped token
- **THEN** the system returns the proposal, design, delta specs, and tasks as a single dense JSON document

#### Scenario: Read with non-agent HTML accept header
- **WHEN** a request with an HTML accept header hits an agent endpoint
- **THEN** the system still returns JSON (agent endpoints are JSON-only by design)

### Requirement: Sandboxed agent task writes
The system SHALL allow agents to create and update tasks within the scoped project, confined to the paths in the agent token's allowlist (see `trust-boundary-enforcement`). Agents SHALL NOT be able to write outside the allowlisted paths. Agents SHALL NOT be able to touch `config.yaml` unless explicitly granted.

#### Scenario: Agent updates task within allowlist
- **WHEN** an agent with a valid token updates a task at an allowlisted path
- **THEN** the system applies the update subject to the trust-boundary enforcement and returns the new section ETag (INV-7)

#### Scenario: Agent writes outside allowlist
- **WHEN** an agent attempts to write to a path outside its token's allowlist
- **THEN** the system rejects the request (delegated to `trust-boundary-enforcement`) and logs the violation

#### Scenario: Agent touches config.yaml without grant
- **WHEN** an agent attempts to modify `config.yaml` and `config.yaml` is not in its allowlist
- **THEN** the system rejects the request

### Requirement: Propose delta spec for human review
The system SHALL provide an endpoint for agents to propose a delta spec. This is a WRITE that creates a pending-review artifact under `openspec/.dashboard/proposals/`; it does NOT merge into the change's canonical delta spec. The response SHALL return a preview URL the human reviewer can use to approve or reject.

#### Scenario: Agent proposes delta spec
- **WHEN** an agent submits a proposed delta spec for a change
- **THEN** the system stores it under `openspec/.dashboard/proposals/`, returns a preview URL, and does NOT modify the canonical delta spec

#### Scenario: Agent writes directly to canonical delta spec
- **WHEN** an agent attempts to write directly to the change's canonical delta spec file
- **THEN** the system rejects the request; agents can only propose, humans merge

#### Scenario: Human reviewer approves proposal
- **WHEN** a human reviewer approves a pending agent proposal via the preview URL
- **THEN** the system merges the proposed delta into the change's canonical delta spec (subject to validation, INV-6) and removes the pending proposal

#### Scenario: Human reviewer rejects proposal
- **WHEN** a human reviewer rejects a pending agent proposal
- **THEN** the system marks the proposal rejected and leaves the canonical delta spec untouched

### Requirement: Agent writes are audit-logged
Every agent write (task update, proposal submission) SHALL emit an audit-log record identifying the token (hashed), the action, and the target path. This satisfies NFR-10 for the agent surface.

#### Scenario: Agent task write audited
- **WHEN** an agent successfully updates a task
- **THEN** the system appends an audit record with the hashed token ID, action, and target path
