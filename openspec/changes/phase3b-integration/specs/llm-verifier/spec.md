## ADDED Requirements

### Requirement: Pluggable LLM verifier backend
The system SHALL provide a pluggable verifier backend that calls a configured LLM to perform `/opsx:verify`-grade reasoning on a change (beyond the Phase 2 heuristic tier). The LLM verifier SHALL sit alongside the heuristic tier; enabling the LLM tier does not remove the heuristic tier. The LLM provider and model SHALL be configurable.

#### Scenario: LLM verifier enabled per-project
- **WHEN** a project has the LLM verifier enabled and a verify is requested
- **THEN** the system runs the heuristic tier AND the LLM tier and returns combined findings

#### Scenario: LLM verifier disabled (default)
- **WHEN** a project has the LLM verifier disabled (the default)
- **THEN** the system runs only the heuristic tier (Phase 2 behavior unchanged)

#### Scenario: LLM provider not configured
- **WHEN** the LLM verifier is enabled but no provider/model is configured
- **THEN** the system falls back to heuristic-only, logs a warning, and surfaces a configuration error to the project admin

### Requirement: LLM verifier findings use the same finding model
The LLM verifier SHALL output findings using the same finding model as the heuristic tier: severity CRITICAL / WARNING / SUGGESTION, each linked to the offending artifact and line. This keeps the validation dashboard (req 06.3) uniform across tiers.

#### Scenario: LLM produces structured findings
- **WHEN** the LLM verifier completes a run
- **THEN** it returns findings with severity, artifact, and line, compatible with the validation dashboard

#### Scenario: LLM returns unstructured or malformed output
- **WHEN** the LLM returns output that cannot be parsed into the finding model
- **THEN** the system discards the LLM output, logs a parse failure, and returns heuristic-only findings (never a crash)

### Requirement: LLM verifier cost and latency surfaced
The system SHALL surface the cost (token usage) and latency of each LLM verifier run to the user. Cost/latency SHALL be recorded with the verification report so project admins can monitor spend.

#### Scenario: Cost and latency recorded
- **WHEN** an LLM verifier run completes
- **THEN** the system records token usage and wall-clock latency on the verification report

#### Scenario: LLM run times out
- **WHEN** an LLM verifier run exceeds the configured timeout
- **THEN** the system aborts the run, records a timeout finding, and falls back to heuristic-only for that run

### Requirement: LLM verifier is advisory
The LLM verifier SHALL be advisory (non-blocking) unless `config.yaml` sets `verify.required: true` for the project (same rule as the heuristic tier, req 06.1(c)). Enabling the LLM tier does not change the blocking policy.

#### Scenario: Advisory mode (default)
- **WHEN** `verify.required` is not set and the LLM verifier returns CRITICAL findings
- **THEN** the change is not blocked; findings are surfaced as advisory

#### Scenario: Required mode
- **WHEN** `verify.required: true` is set and the LLM verifier returns CRITICAL findings
- **THEN** the change is blocked from archiving until the findings are resolved (consistent with heuristic-tier required mode)
