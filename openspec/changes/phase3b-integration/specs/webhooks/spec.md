## ADDED Requirements

### Requirement: Outbound webhook SSRF egress default-deny
The system SHALL enforce a default-deny egress policy for outbound webhooks. The default egress allowlist SHALL be empty (all outbound blocked). Operators MUST explicitly add permitted egress targets. A denylist SHALL be enforced ON TOP of the allowlist to catch misconfiguration: the denylist blocks RFC1918 private ranges (10/8, 172.16/12, 192.168/16), link-local (169.254/16), CGNAT (100.64/10), cloud metadata endpoints (169.254.169.254, fd00:ec2::254), loopback, IPv6 ULA (fc00::/7), IPv6 link-local (fe80::/10), and IPv6-mapped-IPv4 literals (::ffff:0:0/96, which SHALL be normalized to their IPv4 form and checked against the IPv4 denylist before any connection). A denylist-only configuration is insecure and SHALL NOT be supported as the default.

#### Scenario: Target on empty default allowlist
- **WHEN** an outbound webhook targets a URL and the operator has not added any allowlist entries
- **THEN** the system blocks the request and logs an SSRF denial

#### Scenario: Target on explicit allowlist but in denylist
- **WHEN** an operator adds a private range to the allowlist (misconfiguration) and a webhook targets it
- **THEN** the system blocks the request because the denylist is enforced on top of the allowlist

#### Scenario: IPv6-mapped-IPv4 literal normalized and denied
- **WHEN** an outbound webhook targets an IPv6-mapped-IPv4 literal (e.g. `::ffff:10.0.0.1`) that maps to a denied IPv4 private range
- **THEN** the system normalizes the literal to its IPv4 form, matches it against the IPv4 denylist, and blocks the request

#### Scenario: Target on explicit allowlist and not in denylist
- **WHEN** an operator adds a public URL to the allowlist and a webhook targets it
- **THEN** the system allows the request

### Requirement: SSRF DNS pinning
The system SHALL pin the resolved IP address of a webhook target at connection time to defeat DNS rebinding attacks. The system SHALL connect to the pinned IP and SHALL verify the pinned IP is not in the denylist before sending the request. The system SHALL reject redirects to denylisted ranges by default.

#### Scenario: DNS rebinding attempt defeated
- **WHEN** a webhook target's DNS resolves to a public IP at allow-check time but resolves to a private IP at connect time
- **THEN** the system connects to the originally-pinned public IP (or rejects if the pinning window expired) and does not connect to the private IP

#### Scenario: Redirect to denylisted range
- **WHEN** a webhook target returns a redirect to a denylisted IP range
- **THEN** the system rejects the redirect and does not follow it

### Requirement: Outbound webhook domain events
The system SHALL fire outbound webhooks on a defined set of domain events. The supported domain events SHALL be exactly: **change created**, **artifact edited**, **change archived**, and **validation failed** (req 08.5). No other event type SHALL trigger an outbound webhook. A webhook subscription SHALL specify which of these four events it listens for.

#### Scenario: Webhook fires on change created
- **WHEN** a change is created in a project with an outbound webhook subscribed to the `change created` event
- **THEN** the system dispatches the webhook with a payload identifying the event type as `change created` and the change reference

#### Scenario: Webhook fires on validation failed
- **WHEN** a validation check fails in a project with an outbound webhook subscribed to the `validation failed` event
- **THEN** the system dispatches the webhook with a payload identifying the event type as `validation failed` and the failure details

#### Scenario: Webhook does not fire for unsubscribed event
- **WHEN** an event occurs that the webhook subscription is not subscribed to
- **THEN** the system does not dispatch the webhook for that event

### Requirement: Outbound webhook delivery with retry and dead-letter
The system SHALL deliver outbound webhooks with HMAC-signed payloads. Delivery SHALL retry with exponential backoff on transient failure. After the configured maximum retries, the webhook SHALL be placed in a dead-letter queue for operator inspection. The HMAC signature SHALL be computed with a shared secret and a timestamp to prevent replay.

#### Scenario: Successful delivery
- **WHEN** an outbound webhook is dispatched and the receiver returns 2xx
- **THEN** the system records the delivery as successful

#### Scenario: Transient failure with retry
- **WHEN** an outbound webhook receiver returns 5xx or times out
- **THEN** the system retries with exponential backoff up to the configured maximum

#### Scenario: Permanent failure to dead-letter
- **WHEN** an outbound webhook exhausts its maximum retries without success
- **THEN** the system places the payload in a dead-letter queue and records the failure

#### Scenario: HMAC signature verification by receiver
- **WHEN** an outbound webhook is dispatched
- **THEN** the payload includes an HMAC signature and a timestamp the receiver can use to verify authenticity and reject replays

### Requirement: Inbound webhook HMAC verification and rotation
The system SHALL verify HMAC signatures on inbound Git webhooks. The system SHALL support multiple active secrets with documented rotation policy. The system SHALL accept signatures computed with any currently-active secret. Signature verification SHALL use a constant-time comparison.

#### Scenario: Valid signature with active secret
- **WHEN** an inbound webhook arrives with an HMAC signature computed with an active secret
- **THEN** the system accepts the webhook

#### Scenario: Invalid signature rejected
- **WHEN** an inbound webhook arrives with an HMAC signature that does not match any active secret
- **THEN** the system rejects the webhook with 401

#### Scenario: Rotation - old secret during grace period
- **WHEN** a secret has been rotated and an inbound webhook arrives signed with the previous (still-active) secret
- **THEN** the system accepts the webhook during the documented grace period

### Requirement: Inbound webhook idempotent event handling
The system SHALL handle inbound webhook events idempotently using an event-id deduplication. Duplicate events (same event-id) SHALL NOT trigger duplicate side effects.

#### Scenario: Duplicate event ignored
- **WHEN** an inbound webhook arrives with an event-id that has already been processed
- **THEN** the system acknowledges the webhook without reprocessing the event

#### Scenario: Novel event processed
- **WHEN** an inbound webhook arrives with a novel event-id
- **THEN** the system processes the event and records the event-id for deduplication

### Requirement: Webhook configuration is per-project and admin-gated
Webhook configuration (outbound targets, inbound secrets) SHALL be per-project. Configuration changes SHALL be admin-gated and logged in the audit log.

#### Scenario: Admin configures webhooks
- **WHEN** an admin updates webhook configuration for a project
- **THEN** the system applies the configuration and logs the change in the audit log

#### Scenario: Non-admin attempts webhook config
- **WHEN** a non-admin user attempts to modify webhook configuration
- **THEN** the system rejects the request with 403
