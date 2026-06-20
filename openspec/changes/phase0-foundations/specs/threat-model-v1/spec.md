## ADDED Requirements

### Requirement: Living threat-model document covering Phase 0+1 surfaces
The system SHALL maintain a written threat-model document covering every internet- or filesystem-facing surface present in Phase 0 and Phase 1: project registration (path traversal, clone RCE), the agent write API path-confinement surface (forward-looking), inbound webhook forgery/replay (forward-looking), outbound webhook SSRF (forward-looking), multi-tenant data isolation, and public-repo publication (secret leak). The document SHALL be versioned and SHALL be reviewed at the Phase 0 milestone gate (NFR-11).

#### Scenario: Document exists and covers required surfaces
- **WHEN** the Phase 0 milestone verifier inspects the threat-model document
- **THEN** it finds a section for each required surface (registration, agent write, inbound webhook, outbound webhook, multi-tenant isolation, public-repo publication) with at least one identified threat and a mitigation

#### Scenario: Document is versioned and reviewable
- **WHEN** the document is updated
- **THEN** the change is recorded in version control with a date and author, and the Phase 0 gate review is logged

### Requirement: Phase 0 surfaces have concrete mitigations
For surfaces that exist in code in Phase 0 (project registration path allowlist, atomic writes, audit chain), the threat model SHALL record a concrete mitigation that maps to a Phase 0 implementation artifact (spec requirement, task, or code path) — not a placeholder.

#### Scenario: Registration path-traversal threat has a mapped mitigation
- **WHEN** the threat model addresses path traversal in project registration
- **THEN** it cites the path-allowlist requirement (filesystem-projection spec) as the mitigation and does not leave it as "to be designed"

#### Scenario: Forward-looking surfaces marked as such
- **WHEN** the threat model addresses surfaces not yet in code (agent write API, webhooks)
- **THEN** those sections are explicitly marked "forward-looking — implementation in Phase 3b" so they are not mistaken for already-mitigated risks
