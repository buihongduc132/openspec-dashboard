# testing-standard

## Purpose

Project-wide TDD discipline, coverage gates (>80% unit, >40% integration with instrumentation ON),
dead-code prohibition, and the CI tooling that enforces them. Imported by every other capability's
test plan so the rule is stated once, not re-argued per change.

## Requirements

### Requirement: TDD is mandatory
The system's development process SHALL require every production-code change to be preceded by a failing test (red), then implemented to pass (green), then refactored. No production code SHALL be merged without at least one test that was written first and initially failed.

#### Scenario: New feature added without a test
- **WHEN** a change adds production code but no test exists that initially failed for that behavior
- **THEN** the change is rejected at the verifier-loop gate and CI fails with a TDD-discipline error

#### Scenario: Test written then implementation
- **WHEN** a change adds a failing test, then the implementation that makes it pass
- **THEN** the change passes the TDD gate

### Requirement: Unit/TDD line coverage gate
The CI pipeline SHALL measure line coverage on the unit/TDD test suite and SHALL fail the build when unit line coverage is 80% or below. The threshold is strictly greater than 80%.

#### Scenario: Coverage above threshold
- **WHEN** the unit/TDD test suite runs and measured line coverage is above 80%
- **THEN** the coverage gate job passes

#### Scenario: Coverage at or below threshold
- **WHEN** the unit/TDD test suite runs and measured line coverage is 80% or below
- **THEN** the coverage gate job fails with a report listing uncovered lines

### Requirement: Integration line coverage gate with instrumentation ON
The CI pipeline SHALL run an integration test suite with line coverage instrumentation turned ON during the run (measured, not estimated) and SHALL fail the build when integration line coverage is 40% or below. The threshold is strictly greater than 40%.

#### Scenario: Integration coverage instrumentation is active
- **WHEN** the integration test suite runs in CI
- **THEN** line coverage is collected during the run and a real measured number is reported (no estimate, no skip)

#### Scenario: Integration coverage above threshold
- **WHEN** the integration suite runs with instrumentation ON and measured line coverage is above 40%
- **THEN** the integration coverage gate passes

#### Scenario: Integration coverage at or below threshold
- **WHEN** the integration suite runs with instrumentation ON and measured line coverage is 40% or below
- **THEN** the integration coverage gate fails with a report listing uncovered lines

### Requirement: Dead-code prohibition
The CI pipeline SHALL run a dead-code detector over the production source and SHALL fail the build when it finds uncovered, unreferenced, or commented-out production code. Such code is removed before merge, never left in.

#### Scenario: Unreferenced production code present
- **WHEN** the dead-code detector finds a production-code symbol with no references and no test exercising it
- **THEN** the dead-code gate fails listing the symbol and the change must remove it

#### Scenario: Commented-out code blocks present
- **WHEN** the dead-code detector finds commented-out production code blocks
- **THEN** the dead-code gate fails and the blocks must be removed (not uncommented)

### Requirement: Per-phase enforcement
Every phased change proposal (Phase 0 through Phase 4) SHALL cite this testing standard in its design and SHALL include test-writing as explicit task steps. The per-phase verifier-loop gate SHALL check that the coverage numbers (>80% unit, >40% integration) and dead-code absence hold for the code added in that phase before approving it.

#### Scenario: Phase proposal omits test tasks
- **WHEN** a phase change proposal does not reference the testing standard or omits test-writing task steps
- **THEN** the phase proposal is rejected at its verifier-loop gate

#### Scenario: Phase gate checks coverage and dead code
- **WHEN** a phase reaches its verifier-loop milestone
- **THEN** the verifiers confirm the coverage thresholds are met and no dead code was introduced for that phase's code before approval

### Requirement: Standard is cited, not duplicated
Other capabilities' specs SHALL reference this `testing-standard` capability rather than re-stating the coverage thresholds or TDD rules, to keep a single source of truth.

#### Scenario: A phase spec restates the thresholds
- **WHEN** a capability spec re-states the 80%/40% numbers or the TDD rule instead of citing `testing-standard`
- **THEN** the verifier flags the duplication and requires a reference instead
