# multi-project-dashboard Specification

## Purpose
TBD - created by archiving change multi-project-collective-dashboard. Update Purpose after archive.
## Requirements
### Requirement: Collective dashboard landing surface

The dashboard home (`/`) SHALL be the collective, multi-project landing surface.
It MUST show, across **all** enrolled projects at once: the number of enrolled
projects, the total count of changes in flight (non-archived), the total count
of open tasks, and recent cross-project activity. Per-project cards remain
visible and are the entry point into a single project's OpenSpec view.

The collective view MUST be clearly distinct from a single-project view in the
UI (a heading or breadcrumb that signals "all projects"), so the user never
mistakes it for one project's data.

#### Scenario: Empty dashboard before any enrollment

- **WHEN** no projects are enrolled and the user opens `/`
- **THEN** the collective dashboard renders with zero counts, a clear
  "no projects enrolled yet" state, and a prominent enrollment entry point.

#### Scenario: Aggregated counts across multiple projects

- **WHEN** three projects are enrolled with 2, 0, and 5 in-flight changes
  respectively
- **THEN** the collective dashboard shows "3 projects", "7 changes in flight",
  and per-project cards listing 2 / 0 / 5 for each.

### Requirement: Local project enrollment

The dashboard SHALL provide an enrollment flow that lets the user select a
local directory and enroll it as a tracked project. During enrollment the app
MUST detect whether the directory is already an OpenSpec project
(`openspec/config.yaml` present):

- If it is, enroll it directly.
- If it is not, offer to run `openspec init` (via the configured OpenSpec CLI)
  to make it one, then enroll it.

Enrollment records the project in the registry with `enrollmentSource =
"local"` and the absolute local root path. Enrollment MUST NOT mutate the
target directory except when the user explicitly accepts the `openspec init`
offer.

#### Scenario: Enroll an existing local OpenSpec project

- **WHEN** the user selects a directory containing `openspec/config.yaml` and
  confirms enrollment
- **THEN** the project is recorded with `enrollmentSource = "local"`, no files
  in the target directory are modified, and the project appears in the
  collective dashboard.

#### Scenario: Offer init for a non-OpenSpec directory

- **WHEN** the user selects a directory without `openspec/config.yaml`
- **THEN** the flow offers to run `openspec init`, and only on explicit
  acceptance runs the CLI; on decline, enrollment is cancelled with no
  filesystem change.

#### Scenario: Path must be within an allowed root

- **WHEN** the user selects a path outside the operator-configured allow-list
  of enrollment roots
- **THEN** enrollment is rejected with a clear error and no project is created.

### Requirement: Remote git enrollment via gh / glab (planned, stubbed)

The dashboard SHALL expose a remote-git enrollment tab where the user pastes a
GitHub or GitLab URL. The flow MUST detect which authenticated CLI is available
(`gh` for `github.com`, `glab` for `gitlab.com`) by shelling out to the CLI's
auth-status command, and record the intended `remoteGitUrl` with
`enrollmentSource = "remote-git"`.

In **this change**, the remote path is **stubbed**: the UI and CLI detection
are real, but the full clone-into-managed-location + projection is not wired —
the user is told the feature is planned and the enrollment is recorded as a
pending remote project (not yet projected). Full wiring lands with git
integration (req 08.4).

#### Scenario: Detect authenticated gh CLI for a GitHub URL

- **WHEN** the user pastes `https://github.com/org/repo` and `gh auth status`
  reports authenticated
- **THEN** the flow offers to enroll the remote project (stubbed), records
  `enrollmentSource = "remote-git"` and `remoteGitUrl`, and informs the user
  that full clone + projection is pending a later change.

#### Scenario: No authenticated CLI for the URL host

- **WHEN** the user pastes a GitLab URL but `glab` is not installed or not
  authenticated
- **THEN** the flow reports which CLI is missing and does NOT enroll the
  project, and no shell command clones anything.

### Requirement: Drill-down from collective to single project

From the collective dashboard, the user SHALL be able to click any enrolled
project card to enter that single project's OpenSpec view (specs, changes,
tasks, schemas — provided by the per-project modules). Every single-project
view MUST provide a "back to all projects" affordance that returns to the
collective dashboard, so the navigation model is reversible and the user can
always tell they are inside one project versus looking at the collective.

#### Scenario: Drill into a project and return

- **WHEN** the user clicks an enrolled project card, browses that project's
  changes, then clicks "back to all projects"
- **THEN** the user returns to the collective dashboard with its aggregated
  overview, and the URL reflects `/` (collective), not a single project.

#### Scenario: Single-project view signals its scope

- **WHEN** the user is inside one project's OpenSpec view
- **THEN** the UI clearly shows which project is active (name + breadcrumb)
  and is visually distinct from the collective overview, so the two scopes are
  never confused.

