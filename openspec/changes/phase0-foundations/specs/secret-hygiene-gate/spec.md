## ADDED Requirements

### Requirement: Secret scan covers working tree and history
The system SHALL run a secret scan (gitleaks or equivalent) that covers the git history (all refs) AND the working tree. The scan SHALL pass before any code/configuration reaches the public repository.

#### Scenario: Clean history and tree
- **WHEN** gitleaks runs against history and the working tree of a clean repo
- **THEN** it exits 0 with no findings

#### Scenario: Secret in history fails the gate
- **WHEN** gitleaks finds a secret in a pushed commit
- **THEN** the gate fails and the history MUST be rewritten (or the secret rotated) before further work

#### Scenario: Secret in working tree fails pre-commit
- **WHEN** a developer stages a file containing an API key and runs pre-commit
- **THEN** the pre-commit gitleaks hook rejects the commit

### Requirement: Pre-commit, pre-push, and CI gitleaks gates wired
Gitleaks SHALL be wired as a pre-commit hook (working-tree scan), a pre-push hook (pre-push history scan of the about-to-be-pushed refs), and a CI gate (full history + working-tree scan). `.gitleaks.toml` SHALL exist and be committed.

#### Scenario: Hooks are installed and runnable
- **WHEN** a developer clones the repo and runs the hook-install task
- **THEN** pre-commit and pre-push hooks are present and executable, and a deliberate test-secret is caught by each

#### Scenario: CI gate runs on every PR
- **WHEN** a PR is opened
- **THEN** the CI gitleaks job runs over history + working tree and is a required check

### Requirement: gitignore pre-ignores sidecar fallback path and secret-bearing files
`.gitignore` SHALL exclude `.env*`, `*.key`, `*.pem`, `secrets/`, `auth.json`, `config.local.yaml`, the sidecar location (`openspec/.dashboard/` AND the pre-committed fallback `<repo>/.openspec-dashboard/`), server DB files, and anything carrying API keys.

#### Scenario: Both sidecar paths ignored
- **WHEN** a file is created under `openspec/.dashboard/` or `<repo>/.openspec-dashboard/`
- **THEN** `git status` does not show it as untracked

#### Scenario: Secret-bearing file patterns ignored
- **WHEN** a `.env.local` or `service.key` is created in the working tree
- **THEN** `git status` does not show it

### Requirement: Initial-pushed-history scan is a Phase 0 prerequisite
Because the initial public push happened before gitleaks hooks existed, a one-time gitleaks scan of the already-pushed refs (`e8a516f`, `39cb79b`, all refs) SHALL be performed as a Phase 0 prerequisite. The outcome is binary: clean → proceed / dirty → rewrite history and force-update the public repo.

#### Scenario: Initial history clean
- **WHEN** the prerequisite scan runs over the pushed history and finds no secrets
- **THEN** a written finding records "clean" and Phase 0 proceeds

#### Scenario: Initial history dirty
- **WHEN** the prerequisite scan finds a secret in the pushed history
- **THEN** Phase 0 is blocked until the history is rewritten (and the secret rotated), and the public repo is force-updated
