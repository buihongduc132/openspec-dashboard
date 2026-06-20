## ADDED Requirements

### Requirement: Context store and initiative storage
The system SHALL manage context stores and the initiatives they hold as dashboard-owned rows in the existing `context_stores` and `initiatives` Postgres tables (`src/db/schema.ts`), NOT as invented upstream files and NOT under the task/comment sidecar location (`openspec/.dashboard/`). The existing `initiatives.contextStoreId → context_stores.id` FK is retained. Phase 3a adds non-destructive columns: `context_stores.ownerUserId` + `context_stores.workspaceId` (nullable; links a context store into the workspace that authorizes it) and `initiatives.status` (DEFAULT `'proposed'`, required by the status-transition requirement) + `initiatives.updatedAt`. No invented upstream file format is written (CLI parity deferred).

#### Scenario: Initiative stored server-side
- **WHEN** a user creates an initiative in a context store
- **THEN** the initiative persists as a row in the `initiatives` table (chained to its context store) and is NOT written into any project's canonical `openspec/` tree

### Requirement: Authorization reachability via context-store → workspace
Because the existing schema keys initiatives to context stores (`initiatives.contextStoreId`) and context stores to workspaces (`context_stores.workspaceId`, added in Phase 3a), the authorization path to an initiative is the two-hop chain `initiative → context_store → workspace → linked project roles`. There is no direct `initiatives.workspaceId` column. Authorization checks SHALL join through this chain; a missing `context_stores.workspaceId` (nullable) SHALL be treated as deny-by-default (no owning workspace ⇒ no Editor role ⇒ mutation rejected).

#### Scenario: Editor authorizes via the two-hop chain
- **WHEN** a user holding Editor on a project linked into workspace W attempts to mutate an initiative whose context store is linked to W
- **THEN** the authorization join (`initiatives.contextStoreId → context_stores.workspaceId → workspace_links → project_roles`) resolves and the mutation is permitted

#### Scenario: Context store with no workspace is deny-by-default
- **WHEN** a user attempts to mutate an initiative whose context store has a NULL `workspaceId`
- **THEN** the request is rejected with `403` (no owning workspace ⇒ no authorizing role)

### Requirement: Authorization for context-store and initiative mutations
Context-store and initiative create/update/delete SHALL be authorized. The minimum role to mutate a context store or its initiatives SHALL be the **Editor role on at least one project linked into the owning workspace** (or the workspace Owner). Reads (listing, viewing an initiative) SHALL require at least Viewer on at least one linked project. Requests from users with no qualifying role on any linked project SHALL be rejected with `403` (deny-by-default); unauthenticated requests SHALL be rejected with `401`.

#### Scenario: Editor on a linked project creates an initiative
- **WHEN** a user holding Editor on a project linked into workspace W creates an initiative in a context store owned by W
- **THEN** the initiative is created and the action is audit-logged

#### Scenario: Viewer attempts to create an initiative
- **WHEN** a user holding only Viewer on any linked project attempts to create or edit an initiative
- **THEN** the request is rejected with `403`

#### Scenario: Unauthenticated request rejected
- **WHEN** an unauthenticated request (in multi-user mode) attempts any context-store or initiative mutation
- **THEN** the request is rejected with `401` before any mutation runs

### Requirement: Initiative CRUD with status transitions
The system SHALL support initiative CRUD with status transitions: `proposed → active → completed → abandoned`. Invalid transitions SHALL be rejected.

#### Scenario: Valid transition proposed→active
- **WHEN** a user transitions an initiative from `proposed` to `active`
- **THEN** the new status persists and the transition is audit-logged

#### Scenario: Invalid transition rejected
- **WHEN** a user attempts to transition a `completed` initiative directly back to `proposed`
- **THEN** the transition is rejected with a message listing the allowed transitions from the current state

#### Scenario: Initiative abandoned
- **WHEN** a user transitions an initiative to `abandoned`
- **THEN** it is removed from active initiative views but remains queryable for history

### Requirement: Unified cross-repo initiative view
The initiative detail view SHALL show all changes linked to that initiative across all repos in a unified Kanban / list view. The unified view SHALL be scoped by the caller's per-project roles: only linked changes whose source repo the caller can read (at least Viewer) SHALL appear; changes from repos the caller has no role on SHALL be omitted, not rendered as placeholders with their titles. This filter SHALL be structural (a join against `project_roles`), not a post-fetch filter.

#### Scenario: Cross-repo linked changes
- **WHEN** a user opens an initiative that has linked changes in two different repos they can both read
- **THEN** the unified view lists changes from both repos, each labeled with its source repo

#### Scenario: Caller cannot read one of the linked repos
- **WHEN** a user opens an initiative whose linked changes span repo A (Viewer) and repo B (no role)
- **THEN** only A's changes appear; B's changes are omitted entirely (no title, no metadata), preventing cross-project data leak

#### Scenario: Initiative with no links
- **WHEN** an initiative has no linked changes
- **THEN** the unified view renders an empty state guiding the user to link a change
