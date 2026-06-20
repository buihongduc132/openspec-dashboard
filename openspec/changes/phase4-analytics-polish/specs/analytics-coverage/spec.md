## ADDED Requirements

### Requirement: Coverage matrix per spec domain
The system SHALL render a spec coverage heatmap: a matrix of spec domains × metric, where metrics are requirement count, scenario count, number of active changes touching the domain, and number of open validation errors. Each row SHALL drill down to that domain's spec view.

#### Scenario: Drill-down to domain spec view
- **WHEN** the user clicks a domain row in the coverage matrix
- **THEN** the domain's spec view opens

#### Scenario: Domain with no requirements
- **WHEN** a registered spec domain contains zero requirements
- **THEN** the matrix shows that domain's requirement and scenario counts as 0 and flags it as a cold spot

### Requirement: Cold and hot spot detection
The system SHALL flag "cold spots" (spec domains with zero requirements) and "hot spots" (spec domains with more than 10 active changes touching them) with distinct visual indicators. The thresholds SHALL be configurable per deployment.

#### Scenario: Hot spot flagged
- **WHEN** a spec domain has 11 active changes touching it
- **THEN** the domain row is flagged as a hot spot

#### Scenario: Threshold configuration applied
- **WHEN** the deployment sets the hot-spot threshold to 5 and a domain has 6 active changes
- **THEN** the domain is flagged as a hot spot under the configured threshold

### Requirement: Validation error count reflects current validation run
The system SHALL surface, per domain, the count of open validation errors from the most recent validation run; stale or missing validation results SHALL be shown as an explicit "not validated" state rather than a zero.

#### Scenario: Domain never validated
- **WHEN** a domain has no recorded validation run
- **THEN** the validation-errors cell shows "Not validated" instead of 0

#### Scenario: Domain with open errors
- **WHEN** the most recent validation run for a domain recorded 3 errors
- **THEN** the validation-errors cell shows 3 and the domain is visually weighted toward attention
