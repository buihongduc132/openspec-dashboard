## ADDED Requirements

### Requirement: API token creation with step-up auth
The system SHALL allow authenticated users to create API tokens for their projects with scoped permissions (read/write access levels). Token creation SHALL require step-up authentication (re-authentication with password or 2FA) to prevent token theft from compromised sessions.

#### Scenario: Successful token creation with step-up auth
- **WHEN** an authenticated user requests a new API token for a project
- **THEN** the system prompts for step-up authentication
- **WHEN** step-up authentication succeeds
- **THEN** the system generates a token, returns it once in the response, stores a hashed version, and logs the creation in the audit log

#### Scenario: Token creation without step-up auth
- **WHEN** an authenticated user requests a new API token without completing step-up auth
- **THEN** the system rejects the request with a 401 status

### Requirement: Token scope enforcement
The system SHALL enforce token scopes on every API request. Tokens have a project scope (which projects they can access) and an access level (read or read-write). Requests using a token SHALL only succeed if the token's scope permits the operation.

#### Scenario: Token with read scope attempts write
- **WHEN** a request uses a token with read-only scope to perform a write operation
- **THEN** the system rejects the request with a 403 status and logs the violation in the audit log

#### Scenario: Token for project A accesses project B
- **WHEN** a request uses a token scoped to project A to access project B
- **THEN** the system rejects the request with a 403 status and logs the violation in the audit log

### Requirement: Token revocation
The system SHALL allow users to revoke their API tokens. Revoked tokens SHALL be immediately invalid and rejected on subsequent requests.

#### Scenario: Successful token revocation
- **WHEN** a user revokes one of their API tokens
- **THEN** the system marks the token as revoked, rejects all subsequent requests using that token, and logs the revocation in the audit log

#### Scenario: Revoking a token that doesn't exist
- **WHEN** a user attempts to revoke a token ID they don't own
- **THEN** the system rejects the request with a 404 status

### Requirement: Token leak detection with cold-start handling
The system SHALL monitor API token usage for suspicious patterns using a rolling 24h window of per-token (origin-IP, user-agent) fingerprint buckets. Per req 09 §9.5(c), the actionable detection (alert + temporary rate-limit pending reconfirmation) is a **conjunction**: a token is flagged when it is used from a fingerprint bucket not seen in the prior 30 days **AND** the use is geographically implausible (>2000km from the **median** of the last 50 uses). Both conditions MUST be true simultaneously for the alert + rate-limit to fire.

**Geographic median computation:** for tokens with ≥50 uses, the median is computed over the last 50 uses; for tokens with 5–49 uses (cold-start), the median is computed over all available uses (minimum 5).

**Cold-start exemption (<5 uses):** tokens with <5 uses are exempt from geographic implausibility, so the AND conjunction cannot be satisfied. For these tokens, **novel-fingerprint alerting alone applies** — the system SHALL alert the owner when a novel fingerprint bucket appears, but SHALL NOT impose the temporary rate-limit (the rate-limit is reserved for the conjunction path). This is the only path where novel-fingerprint alerting fires independently.

Geo-IP data SHALL be read from an operator-supplied database file specified by the `GEOIP_SOURCE` environment variable. The system SHALL NOT bundle any geo-IP database.

#### Scenario: Novel fingerprint AND geographic implausibility (≥50 uses) triggers alert + rate-limit
- **WHEN** a token with 50+ uses in the past 30 days is used from BOTH a fingerprint bucket not seen in the prior 30 days AND a location >2000km from the median of its last 50 uses
- **THEN** the system alerts the owner AND temporarily rate-limits the token pending owner reconfirmation

#### Scenario: Novel fingerprint AND geographic implausibility (5-49 uses, cold-start median) triggers alert + rate-limit
- **WHEN** a token with 5-49 uses is used from BOTH a novel fingerprint bucket AND a location >2000km from the median (calculated from all available uses)
- **THEN** the system alerts the owner AND temporarily rate-limits the token pending owner reconfirmation

#### Scenario: Novel fingerprint alone with ≥5 uses does NOT trigger rate-limit
- **WHEN** a token with ≥5 uses is used from a novel fingerprint bucket but the location is within 2000km of the median (geographically plausible)
- **THEN** the system does NOT fire the alert and does NOT rate-limit the token (both conditions of the conjunction must be met)

#### Scenario: Geographic implausibility alone with ≥5 uses does NOT trigger rate-limit
- **WHEN** a token with ≥5 uses is used from a known (previously-seen) fingerprint bucket but from a geographically implausible location
- **THEN** the system does NOT fire the alert and does NOT rate-limit the token (the fingerprint must also be novel)

#### Scenario: Token with <5 uses — novel fingerprint alone triggers alert, no rate-limit
- **WHEN** a token with fewer than 5 uses is used from a novel fingerprint bucket
- **THEN** the system alerts the owner of the novel fingerprint (cold-start exemption: geographic check is skipped), but does NOT temporarily rate-limit the token (rate-limit is reserved for the conjunction path)

#### Scenario: Reconfirmation clears the rate-limit
- **WHEN** a token has been temporarily rate-limited pending reconfirmation and the owner reconfirms the token via step-up auth
- **THEN** the system clears the temporary rate-limit and resumes normal enforcement

#### Scenario: GEOIP_SOURCE not configured disables the conjunction path
- **WHEN** the `GEOIP_SOURCE` environment variable is not set or the file does not exist
- **THEN** the system disables the geographic implausibility signal for all tokens (the AND conjunction cannot be satisfied, so no alert + rate-limit fires) and logs a warning; novel-fingerprint alerting for <5-use cold-start tokens continues to operate (it does not require geo-IP data)

### Requirement: Token last-used timestamp tracking
The system SHALL track and persist a last-used timestamp for every API token. The last-used timestamp SHALL be updated on every authenticated request made with that token and SHALL be queryable by the token owner.

#### Scenario: Last-used timestamp updates on each authenticated request
- **WHEN** a request authenticated by token T succeeds
- **THEN** T's `last_used_at` is updated to the current time and persisted before the response is returned

#### Scenario: Owner can query last-used timestamp
- **WHEN** a token owner lists their tokens
- **THEN** each token's `last_used_at` is returned; a never-used token reports a null/never sentinel rather than a fabricated timestamp
