## ADDED Requirements

### Requirement: Lighthouse CI gate

The CI pipeline SHALL run Lighthouse CI and SHALL fail the build when First-Contentful Paint exceeds 1.5s cold or 500ms warm (NFR-1). The gate SHALL be wired from Phase 1 onward.

#### Scenario: Cold FCP exceeds threshold

- **WHEN** Lighthouse CI measures cold FCP above 1.5s on a key route
- **THEN** the CI gate fails and reports the route and measurement

#### Scenario: Cold FCP within threshold

- **WHEN** Lighthouse CI measures cold FCP at or below 1.5s on a key route
- **THEN** the CI gate passes

#### Scenario: Warm FCP exceeds threshold

- **WHEN** Lighthouse CI measures warm FCP above 500ms on a key route
- **THEN** the CI gate fails and reports the route and measurement

#### Scenario: Warm FCP within threshold

- **WHEN** Lighthouse CI measures warm FCP at or below 500ms on a key route
- **THEN** the CI gate passes

### Requirement: k6 read-latency load test

The CI pipeline SHALL run a k6 load test for single-project reads and SHALL fail when p50 ≥ 100ms or p99 ≥ 500ms (NFR-2). Impact-analysis queries SHALL be served from cache on large projects.

#### Scenario: p99 exceeds threshold

- **WHEN** the k6 read-latency test measures p99 at or above 500ms
- **THEN** the CI gate fails with the latency breakdown

#### Scenario: p99 within threshold

- **WHEN** the k6 read-latency test measures p99 below 500ms
- **THEN** the CI gate passes

#### Scenario: p50 exceeds threshold

- **WHEN** the k6 read-latency test measures p50 at or above 100ms
- **THEN** the CI gate fails with the latency breakdown

#### Scenario: p50 within threshold

- **WHEN** the k6 read-latency test measures p50 below 100ms
- **THEN** the CI gate passes

### Requirement: Index-freshness probe

The CI pipeline SHALL include a probe verifying that the search index refreshes within 2s of a write (NFR-6).

#### Scenario: Index lags beyond 2s

- **WHEN** a write occurs and the index has not refreshed after 2s
- **THEN** the freshness probe fails

#### Scenario: Index refreshes within 2s

- **WHEN** a write occurs and the index refreshes within 2s
- **THEN** the freshness probe passes

### Requirement: axe-core per-component accessibility tests

The CI pipeline SHALL run axe-core per-component accessibility tests and SHALL fail on WCAG 2.1 AA + 2.2 AA violations (NFR-9), including the five WCAG 2.2 SC (2.4.11 Focus Not Obscured Min, 2.5.7 Dragging Movements, 2.5.8 Target Size Minimum, 3.3.7 Redundant Entry, 3.3.8 Accessible Auth Min). For the Kanban drag-and-drop specifically, automated axe tests SHALL be supplemented by manual AT testing (NVDA/VoiceOver/JAWS) plus keyboard-interaction scripts; this AT pass SHALL happen in this phase, not be deferred.

#### Scenario: axe violation fails CI

- **WHEN** a component introduces a color-contrast violation detectable by axe
- **THEN** the CI gate fails identifying the component and the SC violated

#### Scenario: DnD manual AT pass is in-phase

- **WHEN** the Kanban DnD is delivered
- **THEN** manual AT test results (NVDA/VoiceOver/JAWS) and keyboard-interaction scripts are recorded as part of this phase's verification, not deferred

### Requirement: NFR plumbing cites testing-standard

This measurement plumbing SHALL be implemented test-first per the `testing-standard` capability (INV-9 / D-TDD / NFR-12). The coverage and dead-code gates from `testing-standard` apply to the CI workflow files and probe scripts added here; they are referenced, not restated.

#### Scenario: CI workflow changes are test-driven

- **WHEN** the Lighthouse/k6/axe CI workflows are added
- **THEN** they ship with tests exercising their threshold logic, satisfying the `testing-standard` gates by reference
