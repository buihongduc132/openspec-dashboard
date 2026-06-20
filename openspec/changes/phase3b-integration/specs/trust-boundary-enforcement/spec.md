## ADDED Requirements

### Requirement: Default-deny trust boundary enforcement
The system SHALL enforce a trust boundary for all agent API and webhook requests. By default, all write operations SHALL be denied unless explicitly allowed through a path allowlist. The allowlist is configured per-project via the trust-boundary configuration file and applies to both agent tokens and inbound webhooks.

#### Scenario: Agent token attempts write to unallowlisted path
- **WHEN** an agent token attempts a write operation to a path not in the allowlist
- **THEN** the system rejects the request with a 403 status and logs the violation in the audit log

#### Scenario: Inbound webhook attempts write to unallowlisted path
- **WHEN** an inbound webhook attempts to write to a path not in the allowlist
- **THEN** the system rejects the request with a 403 status and logs the violation in the audit log

### Requirement: Path allowlist glob matching
The system SHALL support glob patterns in the path allowlist. Glob patterns SHALL match against the normalized file path of the resource being accessed. The allowlist SHALL support wildcards (*) and recursive wildcards (**).

#### Scenario: Glob pattern matches exact path
- **WHEN** the allowlist contains `openspec/changes/*/tasks.md` and an agent writes to `openspec/changes/feature-x/tasks.md`
- **THEN** the system allows the request

#### Scenario: Recursive wildcard matches nested paths
- **WHEN** the allowlist contains `openspec/changes/*/specs/**` and an agent writes to `openspec/changes/feature-x/specs/api.md`
- **THEN** the system allows the request

#### Scenario: Path does not match any allowlist pattern
- **WHEN** an agent writes to `openspec/config.yaml` and the allowlist does not contain a matching pattern
- **THEN** the system rejects the request with a 403 status

### Requirement: Canonical-path deny-list (D-MainSpecCRUD enforcement)
The system SHALL maintain a deny-list of canonical OpenSpec paths that CANNOT be added to the agent/webhook write allowlist, regardless of configuration. The deny-list SHALL include at minimum `openspec/specs/**` (main specs mutate ONLY through change + archive per D-MainSpecCRUD) and `openspec/schemas/**` (schema mutation goes through schema authoring, not direct file writes). If a trust-boundary configuration attempts to allowlist a denied path, the system SHALL reject that pattern at configuration-load time with a clear error explaining the canonical-path restriction.

#### Scenario: Canonical path rejected at config load
- **WHEN** a trust-boundary configuration contains `openspec/specs/**` in the write allowlist
- **THEN** the system rejects the configuration with an error stating that main specs mutate only through change + archive (D-MainSpecCRUD), and falls back to default-deny

#### Scenario: Agent attempts write to canonical path even if misconfigured
- **WHEN** an agent token attempts to write to `openspec/specs/feature-x/spec.md` (a canonical main spec)
- **THEN** the system rejects the request with a 403 status regardless of allowlist contents, because canonical paths are hard-denied

#### Scenario: Change-scoped delta specs are allowed
- **WHEN** the allowlist contains `openspec/changes/*/specs/**` and an agent writes to `openspec/changes/feature-x/specs/api.md`
- **THEN** the system allows the request because change-scoped delta specs are NOT canonical main specs

### Requirement: Trust boundary violation audit logging
The system SHALL log all trust boundary violations to the audit log. Violations include: unauthorized path access, unauthorized HTTP verb, rate limit exceeded, and unauthorized action type. The audit log entry SHALL include the token ID (hashed), the attempted path, the HTTP verb, the action, and the reason for rejection.

#### Scenario: Unauthorized path access logged
- **WHEN** an agent token attempts to write to an unallowlisted path
- **THEN** the system logs the violation to the audit log with the hashed token ID, attempted path, HTTP verb, action, and rejection reason

#### Scenario: Rate limit exceeded logged
- **WHEN** a token exceeds its write rate limit
- **THEN** the system rejects the request with a 429 status and logs the violation to the audit log

### Requirement: Token write rate limiting
The system SHALL enforce per-token write rate limits. The rate limit is configurable per-token and the system-wide default SHALL be **60 writes per minute** (req 09.10). Rate limits SHALL be enforced using a sliding window algorithm.

#### Scenario: Token within rate limit
- **WHEN** a token makes a write request within its rate limit
- **THEN** the system allows the request

#### Scenario: Token exceeds the default 60/min rate limit
- **WHEN** a token makes its 61st write request within a sliding 1-minute window using the default rate limit
- **THEN** the system rejects the request with a 429 status

#### Scenario: Token exceeds a custom rate limit
- **WHEN** a token with a custom-configured rate limit (e.g. 30/min) exceeds that configured limit
- **THEN** the system rejects the request with a 429 status

### Requirement: Trust boundary configuration
The system SHALL provide a trust-boundary configuration file per project. The configuration SHALL specify the path allowlist (glob patterns) and token write rate limits. The configuration file SHALL be validated on load and the system SHALL reject invalid configurations.

#### Scenario: Valid trust-boundary configuration
- **WHEN** the trust-boundary configuration file contains valid glob patterns and rate limits
- **THEN** the system loads the configuration and enforces the trust boundary

#### Scenario: Invalid trust-boundary configuration
- **WHEN** the trust-boundary configuration file contains invalid glob syntax
- **THEN** the system rejects the configuration, logs an error, and falls back to default-deny
