## ADDED Requirements

### Requirement: Login SHALL support multi-factor authentication
The system SHALL accept a time-based one-time password (TOTP) as a second
factor when the user has enrolled a TOTP authenticator.

#### Scenario: MFA-enrolled user logs in
- **WHEN** an MFA-enrolled user submits valid credentials plus a valid TOTP
- **THEN** the system SHALL respond with 200 and a session token

## MODIFIED Requirements

### Requirement: Login SHALL issue a session token
The system SHALL issue a session token to a user who provides valid
credentials and, when enrolled, a valid second factor. The token SHALL
expire after 24 hours of inactivity.

## REMOVED Requirements

### Requirement: Legacy cookie auth

## RENAMED Requirements

- Requirement: Session Token -> Requirement: Auth Token
