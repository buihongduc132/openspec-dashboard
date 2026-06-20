## ADDED Requirements

### Requirement: Heuristic verification pass
The system SHALL run a heuristic verification pass on a change covering three dimensions: **completeness** (all `tasks.md` items checked; every delta-spec requirement has at least one implementing task; every ADDED requirement has scenarios), **correctness** (keyword overlap between task prose and requirement intent; Given/When/Then verbs echoed in tasks — documented as best-effort, NOT AI-grade), and **coherence** (design decisions reflected in delta specs and tasks via keyword overlap; design decisions without implementing tasks flagged). Output SHALL be a findings list with severity CRITICAL / WARNING / SUGGESTION, each linked to the offending artifact and line. "Re-run after fix" SHALL rerun only the failing checks for speed. Verification SHALL be non-blocking (advisory) unless `config.yaml` sets `verify.required: true` for the project. The LLM tier is NOT included (Phase 3b per the plan).

#### Scenario: Completeness finding for missing task
- **WHEN** a delta spec adds requirement R but no task in `tasks.md` references R
- **THEN** the heuristic emits a CRITICAL finding linked to requirement R

#### Scenario: ADDED requirement without scenarios
- **WHEN** a delta spec adds a requirement with no `#### Scenario:` blocks
- **THEN** the heuristic emits a CRITICAL completeness finding on that requirement

#### Scenario: Coherence finding for orphan decision
- **WHEN** `design.md` describes a decision not reflected in any task or delta spec
- **THEN** the heuristic emits a WARNING coherence finding linked to the design section

#### Scenario: Advisory unless required
- **WHEN** `config.yaml` does not set `verify.required: true` and findings exist
- **THEN** the findings surface but do not block archive

#### Scenario: Blocking when required
- **WHEN** `config.yaml` sets `verify.required: true` and CRITICAL findings exist
- **THEN** the change cannot archive until those CRITICAL findings are resolved

#### Scenario: Re-run after fix only reruns failures
- **WHEN** a user fixes two of five findings and clicks "Re-run"
- **THEN** only the previously failing checks are rerun, reducing runtime

### Requirement: Project-wide spec validation
The system SHALL run `openspec validate`-equivalent at project scope: every spec file and every delta spec in every change, aggregated into a report grouped by file. Findings SHALL use the same model as the per-spec validation from Phase 1 (`02-specs.md` §2.5). The report SHALL be filterable by severity, file, and rule id.

#### Scenario: Aggregated report across changes
- **WHEN** a user runs project-wide validation and three changes each have a delta-spec error
- **THEN** the report lists all three findings grouped by file, filterable by severity and rule id

#### Scenario: Clean project
- **WHEN** a project has no validation findings
- **THEN** the report shows zero findings and a green status

### Requirement: Validation dashboard
The system SHALL provide an aggregated validation dashboard across all changes and specs: counts by severity, top offending files, and a trend over time (findings opened vs resolved). The trend SHALL be fed by the Phase 0 audit log (validation runs and resolutions). The dashboard SHALL support drill-down from a tile to the finding list scoped to that severity or file.

#### Scenario: Drill-down by severity
- **WHEN** a user clicks the "CRITICAL: 4" tile on the validation dashboard
- **THEN** the finding list filters to those four CRITICAL findings

#### Scenario: Trend from audit log
- **WHEN** the audit log records validation runs and resolutions over a week
- **THEN** the trend chart plots findings-opened vs findings-resolved per day for that week

#### Scenario: No audit log yet
- **WHEN** the audit log is empty or unavailable
- **THEN** the trend degrades to "no historical data" while the current counts still render

#### Scenario: Drill-down to a file
- **WHEN** a user clicks a top-offending file on the dashboard
- **THEN** the finding list filters to findings in that file
