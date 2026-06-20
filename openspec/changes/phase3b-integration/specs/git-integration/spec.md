## ADDED Requirements

### Requirement: Commit-on-save (configurable)
The system SHALL optionally commit canonical OpenSpec artifact changes to the project's local git repository on every successful save. This behavior is configurable per-project (default: off). Commit messages SHALL be structured and machine-parseable in the form `chore(openspec): <verb> <entity>` (e.g. `chore(openspec): edit task T-12`, `chore(openspec): archive change add-auth`).

#### Scenario: Commit-on-save enabled
- **WHEN** commit-on-save is enabled for a project and a canonical artifact save succeeds
- **THEN** the system commits the change with a structured message and logs the commit hash in the audit log

#### Scenario: Commit-on-save disabled (default)
- **WHEN** commit-on-save is disabled (the default) and a canonical artifact save succeeds
- **THEN** the system writes the file but does NOT create a git commit

#### Scenario: Git commit fails
- **WHEN** commit-on-save is enabled but the git commit fails (e.g. lock contention, disk error) AFTER the canonical save has already written bytes to disk
- **THEN** the system keeps the in-memory projection in sync with the persisted file (INV-1: filesystem is truth — the save succeeded and the file on disk IS the canonical state), does NOT silently roll back the projection, records the commit failure as a non-fatal git-integration error in the audit log, and surfaces a notification to the user that the change is saved-but-not-committed so the user can retry the commit manually

### Requirement: Branch-per-change (configurable)
The system SHALL optionally create one branch per change, named `<prefix>/<change-name>` (configurable prefix, default `change`). Push is always explicit and user-initiated; branch creation does not push. This behavior is configurable per-project (default: off).

#### Scenario: Branch created on change creation
- **WHEN** branch-per-change is enabled and a new change is created
- **THEN** the system creates branch `change/<change-name>` off the current HEAD but does NOT push

#### Scenario: Branch-per-change disabled
- **WHEN** branch-per-change is disabled (the default)
- **THEN** changes are committed to the current branch only

### Requirement: Auto-PR on archive REQUIRES autoPush
The system SHALL optionally open a pull request on the configured forge when a change is archived. **This feature REQUIRES `autoPush: true` (default off).** There is no "auto-PR without push" mode: a forge cannot open a PR for a branch that was never pushed. With `autoPush: false` (default), archive commits to the change's local branch only and the user pushes manually. With `autoPush: true`, archive commits, pushes the branch, and opens a PR via the configured forge API in one transaction. The PR target branch SHALL be configurable per-project (default: the project's default branch, e.g. `main`; configurable to `develop` or a custom branch name).

#### Scenario: Auto-PR with autoPush enabled
- **WHEN** auto-PR is configured, `autoPush: true` is set, and a change is archived
- **THEN** the system commits the archive, pushes the branch to the remote, opens a PR against the configured target branch (default `main`, or the per-project configured target) via the forge API, and records the PR URL in the audit log

#### Scenario: Auto-PR with custom target branch
- **WHEN** auto-PR is configured with a custom target branch (e.g. `develop`) and `autoPush: true` is set
- **THEN** the system opens the PR against the configured custom target branch, not the default

#### Scenario: Auto-PR requested without autoPush
- **WHEN** auto-PR is configured but `autoPush` is `false` (the default) and a change is archived
- **THEN** the system commits the archive to the local branch only, does NOT push, and does NOT open a PR, returning a message that push is required first

#### Scenario: Forge API call fails during auto-PR
- **WHEN** `autoPush: true` and the PR-creation forge API call fails after the push succeeded
- **THEN** the system records the pushed branch state, surfaces the forge error to the user, and logs the partial completion so the user can retry the PR step

### Requirement: Merge conflict surfaces merge UI
The system SHALL detect merge conflicts during git pull/merge operations performed on the project's repository. On conflict, the system SHALL surface a merge UI rather than failing silently.

#### Scenario: Pull with no conflicts
- **WHEN** a git pull is performed and there are no conflicts
- **THEN** the system fast-forwards or merges and refreshes the projection (NFR-3 ≤2s)

#### Scenario: Pull with merge conflict
- **WHEN** a git pull is performed and a merge conflict occurs
- **THEN** the system does NOT silently fail and instead surfaces a merge UI showing the conflicting files for user resolution

### Requirement: PR state is dashboard-only
PR state (open/merged/closed, review status) created by auto-PR is dashboard-only metadata. It SHALL NOT be part of CLI-parity scope (the OpenSpec CLI cannot consume PR state and that is by design). PR state is stored in dashboard metadata, not in canonical OpenSpec artifacts.

#### Scenario: PR state stored in dashboard metadata
- **WHEN** a PR is opened via auto-PR
- **THEN** the PR URL and state are recorded in dashboard metadata (`openspec/.dashboard/`) and NOT written to any canonical OpenSpec artifact

#### Scenario: CLI ignores PR state
- **WHEN** the `openspec` CLI validates or reads the project
- **THEN** the PR state in dashboard metadata does not affect validation (INV-1, §8.9 gate 1)
