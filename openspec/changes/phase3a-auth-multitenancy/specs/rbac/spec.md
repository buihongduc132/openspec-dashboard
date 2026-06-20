## ADDED Requirements

### Requirement: Per-project roles
The system SHALL enforce per-project roles: **Owner**, **Editor**, **Viewer**. Role assignment is per-project (not global), and every endpoint that operates on a project SHALL check the caller's role for that project.

#### Scenario: Editor writes to project
- **WHEN** a user with the Editor role on project P issues a POST to `/api/projects/{P}/changes`
- **THEN** the request is accepted

#### Scenario: Viewer cannot write
- **WHEN** a user with the Viewer role on project P issues the same POST
- **THEN** the request is rejected with `403` and the role check is audit-logged

#### Scenario: User with no role is denied
- **WHEN** a user who has no role on project P issues any mutating request against P
- **THEN** the request is rejected with `403` (deny-by-default)

### Requirement: Owner transfer
Ownership of a project SHALL be transferable only with explicit confirmation from the current owner.

#### Scenario: Owner transfers to another user
- **WHEN** the current owner initiates a transfer and the target user confirms the transfer via a signed token or explicit accept flow
- **THEN** the target user becomes the new Owner and the former owner's role becomes Editor (or is removed, per the operator's choice)

#### Scenario: Transfer without current-owner confirmation
- **WHEN** a transfer is initiated but the current owner does not confirm
- **THEN** the transfer is rejected and no role change occurs

### Requirement: Anonymous read-only public link
A project MAY optionally enable an anonymous read-only public link. When disabled (the default), unauthenticated requests to project endpoints SHALL be rejected.

#### Scenario: Public link enabled
- **WHEN** a project enables the public read-only link and an unauthenticated user requests a read-only project endpoint
- **THEN** the request is accepted with the Viewer-equivalent scope

#### Scenario: Public link disabled
- **WHEN** a project has not enabled the public link and an unauthenticated user requests any project endpoint
- **THEN** the request is rejected with `401`
