## ADDED Requirements

### Requirement: Release documentation set
The system SHALL ship user-facing documentation covering: a getting-started guide, a demo dataset with a walkthrough, and a contribution guide (development setup, testing entry points, change-proposal workflow). The documentation SHALL be versioned with the release.

#### Scenario: New contributor onboarding
- **WHEN** a new contributor clones the repo and follows the getting-started + contribution guide
- **THEN** they can run the dashboard locally and submit a change proposal without asking for tribal knowledge

#### Scenario: Demo dataset runs
- **WHEN** a user loads the demo dataset
- **THEN** the dashboard renders a representative multi-project state suitable for a walkthrough without requiring a real OpenSpec project

### Requirement: Two-person secret-scanned publication gate
Releases of sensitive material (auth keys, production configs, or any subsequent secret-bearing release) SHALL require a two-person manual review and a secret scan of both history (all refs) and the working tree before publication. The gate SHALL block and fail loudly if the scan finds any secret.

#### Scenario: Clean scan passes the gate
- **WHEN** a two-person review completes and the secret scan finds zero leaks in history and working tree
- **THEN** the publication proceeds

#### Scenario: Secret found blocks publication
- **WHEN** the secret scan finds a leak in any ref or the working tree
- **THEN** publication is blocked, the finding is reported, and history is rewritten and force-pushed before retry (per the Phase 0.6 retroactive-scan policy)

### Requirement: UI modernization preserves behavior and meets NFRs
The UI modernization pass SHALL consolidate the design system across Phase 1–3 components without changing spec-level behavior. After the pass, the dashboard SHALL meet NFR-1 (first-contentful paint), NFR-2 (API p50/p99), and NFR-9 (WCAG 2.1 AA + WCAG 2.2 AA) including a re-run of manual AT testing.

#### Scenario: No behavioral regression from modernization
- **WHEN** the UI modernization pass lands
- **THEN** all Phase 1–3 acceptance tests still pass unchanged, because the pass alters presentation only

#### Scenario: NFR budgets enforced in CI
- **WHEN** the modernized build is evaluated in CI
- **THEN** Lighthouse CI (NFR-1), k6 (NFR-2), and axe-core + manual AT scripts (NFR-9) all pass or the release is blocked

### Requirement: Release follows the testing standard
All Phase 4 code (analytics queries, export/restore, UI changes) SHALL be developed test-first and SHALL meet the project's coverage and dead-code gates defined by the `testing-standard` capability. Each Phase 4 task SHALL include its test-writing step; the Phase 4 verifier-loop milestone SHALL verify the coverage thresholds hold and no dead code was introduced.

#### Scenario: Analytic query added without a test
- **WHEN** an analytics query is added without a failing test written first
- **THEN** the change is rejected at the Phase 4 verifier-loop gate per the testing standard

#### Scenario: Release ships dead code
- **WHEN** the dead-code detector finds unreferenced production code introduced in Phase 4
- **THEN** the release is blocked until the dead code is removed
