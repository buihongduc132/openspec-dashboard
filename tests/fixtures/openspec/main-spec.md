## Purpose

Define the authentication capability: how users log in, how sessions are
issued, and how they expire.

## Requirements

### Requirement: Login SHALL issue a session token
The system SHALL issue a session token to a user who provides valid
credentials. The token SHALL expire after 24 hours of inactivity.

#### Scenario: Successful login
- **WHEN** a user submits a valid email and password
- **THEN** the system SHALL respond with 200 and a session token

#### Scenario: Invalid credentials
- **WHEN** a user submits an invalid password
- **THEN** the system SHALL respond with 401 and SHALL NOT issue a token

### Requirement: Sessions SHALL expire on inactivity
An idle session SHALL be invalidated once 24 hours elapse without a
request carrying that session.

#### Scenario: Idle session expires
- **WHEN** no request uses a session token for 24 hours
- **THEN** the next request with that token SHALL be rejected with 401
