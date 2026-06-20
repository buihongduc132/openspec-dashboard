## ADDED Requirements

### Requirement: Workspace creation and linking
The system SHALL allow creating coordination workspaces that link multiple registered projects with stable aliases and a selected opener tool. Workspaces SHALL be stored as dashboard-owned rows in the existing `workspaces` / `workspace_links` Postgres tables (`src/db/schema.ts`), NOT as invented upstream files and NOT under the task/comment sidecar location (`openspec/.dashboard/`). Phase 3a adds the ownership column `workspaces.ownerUserId` (FK → users, nullable for the implicit local user) to these existing tables via a non-destructive migration; it does not recreate them.

#### Scenario: Create a workspace with two linked projects
- **WHEN** a user creates a workspace and links project A (alias "backend") and project B (alias "frontend")
- **THEN** the workspace persists with those aliases and appears in workspace listings

#### Scenario: No invented upstream file
- **WHEN** a workspace is created
- **THEN** no file is written into the linked projects' `openspec/` trees; the manifest lives server-side only (CLI parity deferred until the upstream workspace format is confirmed)

### Requirement: Cross-project aggregation
A workspace view SHALL aggregate changes and tasks across all linked projects so the user can see what is moving across the workspace in one place. The aggregation SHALL be filtered by the caller's per-project role: only changes/tasks from links where the caller holds at least the Viewer role SHALL be visible; links the caller has no role on SHALL be omitted (or rendered as a permission-denied placeholder), never surfaced with their data. The role filter SHALL be applied structurally at the query layer (a join against `project_roles`, deny-by-default), NOT as a post-fetch filter that a query path could bypass.

#### Scenario: Aggregated change list
- **WHEN** a user opens a workspace's aggregated view
- **THEN** changes from every linked project where the caller holds at least Viewer appear together, each labeled with its source project alias

#### Scenario: Caller lacks a role on one linked project
- **WHEN** a Viewer on project A opens a workspace linking A and B, and the caller has no role on B
- **THEN** A's changes/tasks render normally and B's data is NOT returned (no cross-project data leak); B's link appears as a permission-denied placeholder at most

#### Scenario: Empty workspace
- **WHEN** a workspace has no linked projects
- **THEN** the aggregated view renders an empty state guiding the user to link a project

### Requirement: Broken-link health and workspace doctor
The system SHALL resolve each linked project's path on open and surface broken links as health warnings with "relpath" / "relink" actions. A workspace doctor SHALL run per-link checks plus cross-link consistency.

#### Scenario: Linked project path missing
- **WHEN** a workspace link points at a project whose `rootPath` no longer resolves on disk
- **THEN** the workspace surfaces a health warning with relink/repath actions and does not crash the aggregated view

#### Scenario: Doctor detects duplicate alias
- **WHEN** the workspace doctor runs and two links share the same alias
- **THEN** the doctor reports the inconsistency as a fixable health issue

#### Scenario: Doctor runs clean
- **WHEN** all links resolve and aliases are unique
- **THEN** the doctor reports a healthy workspace with no warnings
