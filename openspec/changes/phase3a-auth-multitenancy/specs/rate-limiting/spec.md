## ADDED Requirements

### Requirement: Per-token and per-IP rate limits on mutating endpoints
The system SHALL apply rate limits on mutating endpoints, keyed per-token (where a session/token is present) and per-IP. Limits SHALL be configurable per deployment.

#### Scenario: Under the limit
- **WHEN** a user issues mutating requests below the configured per-token limit
- **THEN** all requests are accepted normally

#### Scenario: Over the limit
- **WHEN** a user exceeds the configured per-token mutating-request limit within the window
- **THEN** subsequent mutating requests return `429` with a `Retry-After` header and a clear reason identifying the limit that was hit

#### Scenario: Limits configurable
- **WHEN** an operator sets per-deployment rate-limit values
- **THEN** the running server uses those values without code changes

### Requirement: Burst protection on auth endpoints
Auth endpoints (login, OAuth start, password reset, invite accept) SHALL have stricter burst protection than general mutating endpoints, to blunt credential-stuffing and invite-token probing.

#### Scenario: Brute-force password attempts throttled
- **WHEN** a single IP submits more than the configured burst threshold of failed logins within the auth burst window
- **THEN** further login attempts from that IP return `429` with `Retry-After` for the remainder of the window

#### Scenario: Invite-token probing throttled
- **WHEN** a single IP submits invite-accept attempts above the auth burst threshold
- **THEN** further invite-accept attempts from that IP return `429`

### Requirement: 429 responses are informative
Every `429` response SHALL include a `Retry-After` header and a human-readable reason identifying which limit (per-token mutating, per-IP mutating, or auth-burst) was exceeded.

#### Scenario: Informative 429
- **WHEN** any rate limit triggers
- **THEN** the response body and `Retry-After` header tell the client when to retry and which limit applied
