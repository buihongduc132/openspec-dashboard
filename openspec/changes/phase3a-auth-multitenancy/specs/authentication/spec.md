## ADDED Requirements

### Requirement: Local loopback no-auth mode (default)
The system SHALL run without authentication when bound to a loopback interface only. When a deployment binds to a non-loopback interface, the system SHALL refuse to start unless the operator explicitly opts in via `--allow-network`. A UI banner SHALL clearly state "local mode — no auth" when local mode is active.

#### Scenario: Loopback bind starts without auth
- **WHEN** the server starts bound to `127.0.0.1` (or `::1`) with no auth configured
- **THEN** it starts in local mode, treats all requests as the single local user, and the UI renders a "local mode — no auth" banner

#### Scenario: Non-loopback bind without opt-in is refused
- **WHEN** the server is configured to bind to `0.0.0.0` (or any non-loopback interface) and `--allow-network` is not set
- **THEN** the server refuses to start and prints an error naming the offending interface and the required flag

#### Scenario: Docker port-publish warning
- **WHEN** the operator follows the container deployment docs
- **THEN** the docs explicitly warn that Docker `-p` binds `0.0.0.0` by default and that local mode requires the `127.0.0.1:` prefix

### Requirement: Email/password authentication
The system SHALL authenticate multi-user mode users via email and password. Passwords SHALL be stored using argon2id; plaintext and unsalted hashes are forbidden.

#### Scenario: Successful password login
- **WHEN** a user submits a valid email + correct password
- **THEN** the server establishes an httpOnly secure-cookie session and returns success

#### Scenario: Wrong password
- **WHEN** a user submits a valid email with an incorrect password
- **THEN** the server rejects the login with a generic "invalid credentials" message that does not reveal which field was wrong, and applies auth-endpoint burst protection (see the rate-limiting capability)

#### Scenario: Password is never stored verbatim
- **WHEN** a user registers or changes their password
- **THEN** only an argon2id hash is persisted; no plaintext or unsalted hash is ever written

### Requirement: OAuth with PKCE
The system SHALL support OAuth login via GitHub and Google. OAuth flows SHALL use PKCE; OAuth tokens SHALL never be logged.

#### Scenario: OAuth round-trip with PKCE
- **WHEN** a user initiates GitHub or Google OAuth
- **THEN** the flow uses PKCE (code verifier + challenge), exchanges the code for tokens server-side, and creates a session cookie

#### Scenario: OAuth tokens are never logged
- **WHEN** any log line is emitted during an OAuth flow
- **THEN** access tokens, refresh tokens, and the PKCE verifier are redacted or omitted

### Requirement: Session cookies and CSRF protection
Sessions SHALL be carried in httpOnly, Secure, SameSite cookies. Every state-changing endpoint SHALL enforce CSRF protection.

#### Scenario: Session cookie attributes
- **WHEN** a session cookie is set
- **THEN** it carries `HttpOnly`, `Secure` (in TLS deployments), and `SameSite=Lax` (or `Strict`)

#### Scenario: State-changing request without CSRF token
- **WHEN** a POST/PATCH/DELETE request arrives without a valid CSRF token
- **THEN** the server rejects it with `403` and does not perform the mutation

### Requirement: Optional TOTP MFA, mandatory for admin
TOTP-based MFA SHALL be available to all users and SHALL be required for any user holding the admin role.

#### Scenario: User enables TOTP
- **WHEN** a non-admin user opts into TOTP and completes the TOTP enrollment
- **THEN** subsequent logins require a valid TOTP code

#### Scenario: Admin must have MFA
- **WHEN** a user is about to be granted the admin role (or an admin login occurs) and the user has no TOTP configured
- **THEN** the grant is blocked (or the login is rejected) with a message requiring MFA enrollment first

### Requirement: MFA recovery codes
At TOTP enrollment, the system SHALL generate a set of single-use recovery codes and SHALL accept any unused recovery code in place of a TOTP code at login. Recovery-code use SHALL be audit-logged and the used code SHALL be revoked. This prevents an admin (or any MFA user) from being permanently locked out by a lost authenticator device.

#### Scenario: Recovery code generated at enrollment
- **WHEN** a user completes TOTP enrollment
- **THEN** a set of single-use recovery codes is generated, displayed once, and their hashes are stored (never in plaintext)

#### Scenario: Recovery code unlocks a locked-out user
- **WHEN** a user who has lost their authenticator submits a valid, unused recovery code at login
- **THEN** the login succeeds, the recovery code is revoked (single-use), and the redemption is audit-logged

#### Scenario: Reused recovery code rejected
- **WHEN** a recovery code that has already been used is submitted again
- **THEN** the login is rejected and no second use is permitted

#### Scenario: Admin lockout is recoverable
- **WHEN** an admin loses their authenticator device
- **THEN** the admin can regain access via a recovery code (no operator intervention required, no permanent admin lockout)
