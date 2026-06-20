## ADDED Requirements

### Requirement: Team grouping and team-level project roles
The system SHALL allow users to be grouped into teams and SHALL support assigning project roles at the team level. A user's effective role on a project SHALL be the **highest-privilege** of their direct role and the roles inherited via team memberships, using the hierarchy **Owner > Editor > Viewer** (no "union" — privilege levels are ordered, so the maximum wins). Where the caller holds no direct and no team role on a project, access is deny-by-default.

| Direct role | Team role(s) | Effective role |
|---|---|---|
| Owner | any/none | Owner |
| Editor | Owner (via team) | Owner |
| Editor | Editor/Viewer/none | Editor |
| Viewer | Editor (via team) | Editor |
| Viewer | Viewer/none | Viewer |
| (none) | Owner (via team) | Owner |
| (none) | Editor (via team) | Editor |
| (none) | Viewer (via team) | Viewer |
| (none) | none | deny (403) |

#### Scenario: Team role grants access
- **WHEN** a team is granted the Editor role on project P and a member of that team requests a write to P
- **THEN** the request is accepted using the inherited team role

#### Scenario: Higher team role overrides lower direct role
- **WHEN** a user holds the direct Viewer role on P AND is a member of a team granted Editor on P
- **THEN** the user's effective role on P is Editor (highest privilege wins)

#### Scenario: Direct Owner is preserved against lower team role
- **WHEN** a user holds the direct Owner role on P AND is a member of a team granted Viewer on P
- **THEN** the user's effective role on P is Owner

#### Scenario: Team membership removed
- **WHEN** a user is removed from a team that granted them Editor on project P and they have no other role on P
- **THEN** the user's next request to write to P is rejected

### Requirement: Email invites with expiry and single-use tokens
The system SHALL invite new team members by email using tokens that expire (default 7 days) and are single-use.

#### Scenario: Valid invite accepted
- **WHEN** an invitee clicks a valid, unexpired, unused invite token and completes signup/login
- **THEN** they are added to the team and the token is marked used

#### Scenario: Expired invite rejected
- **WHEN** an invitee attempts to use a token older than the configured expiry
- **THEN** the token is rejected with a "link expired" message and no membership is created

#### Scenario: Reused invite rejected
- **WHEN** an invite token that has already been used is presented again
- **THEN** the token is rejected and no second membership is created

### Requirement: Team management actions are audit-logged
The system SHALL record every team creation, membership change, role assignment, and invite action in the audit log with the acting user, target team, and target user.

#### Scenario: Membership removal audited
- **WHEN** a team admin removes a member from a team
- **THEN** an audit entry records actor, team, removed member, and timestamp

#### Scenario: Invite redemption audited
- **WHEN** an invitee redeems a valid invite token
- **THEN** an audit entry records the redemption, actor (invitee), and team

### Requirement: Immediate role propagation via session-version stamp
The system SHALL propagate team membership and role changes to derived project roles immediately. Every session SHALL carry a `roleVersion`; the server tracks the current `roleVersion` per user. On mismatch, the session is force-reloaded (roles re-fetched) on the next request. Active WebSocket connections SHALL receive a `roles-changed` event and must re-auth.

#### Scenario: Role change invalidates active session
- **WHEN** an admin demotes a user from Editor to Viewer on project P while that user has an active session
- **THEN** the user's next request to P carries a stale `roleVersion`, the server re-fetches the user's roles, the new Viewer role is enforced, and the user's `roleVersion` is updated

#### Scenario: WebSocket receives roles-changed
- **WHEN** a role or team membership change affects a user with an open WebSocket connection
- **THEN** the connection receives a `roles-changed` event and the client must re-authenticate before further privileged actions

#### Scenario: Mismatch handled without data loss
- **WHEN** a session with a stale `roleVersion` issues a mutating request that the new role no longer permits
- **THEN** the request is rejected (deny-by-default with refreshed roles) rather than silently allowed under the old role
