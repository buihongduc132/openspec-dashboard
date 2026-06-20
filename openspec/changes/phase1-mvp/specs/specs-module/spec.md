## ADDED Requirements

### Requirement: Spec listing with live filesystem counts
The system SHALL list every spec domain under `openspec/specs/<domain>/*.md` as cards or rows showing: domain name, requirement count, scenario count, last-modified date, and count of active changes touching it. Counts SHALL be derived from the live filesystem parse, not from a cache older than the refresh window.

#### Scenario: Listing a populated domain
- **WHEN** the project has a domain with 5 requirement files and 12 scenarios
- **THEN** the listing shows requirement count 5 and scenario count 12, reconciled within the refresh window

#### Scenario: Listing an empty domain
- **WHEN** a domain directory exists but has no `.md` files
- **THEN** the listing shows it with zero counts and does not error

#### Scenario: Filter by active-changes
- **WHEN** the user filters by "has active changes"
- **THEN** only domains touched by at least one active change delta are shown

### Requirement: Spec detail rendered read-only with outline
The system SHALL render a spec file as Markdown with a structured outline sidebar (Spec → Requirements → Scenarios). Clicking an outline item SHALL scroll to and highlight it. A "View raw" toggle SHALL show the verbatim file with no transformation. An inline banner SHALL state "main specs are mutated via changes" with a CTA to create a change targeting this domain.

#### Scenario: Outline navigation
- **WHEN** a user clicks "Requirement: User can export data" in the outline
- **THEN** the view scrolls to and highlights that requirement heading

#### Scenario: Raw view shows verbatim bytes
- **WHEN** a user toggles "View raw"
- **THEN** the verbatim file content is shown with no formatting, whitespace, or marker normalization (INV-2)

#### Scenario: Missing spec file
- **WHEN** a spec file referenced by the URL does not exist
- **THEN** the system returns a 404 with a clear message, not a crash

### Requirement: Propose requirement change via delta spec
The system SHALL offer a "Propose requirement change" action that creates or appends to a change's delta spec with the appropriate verb (ADDED / MODIFIED / REMOVED / RENAMED). Direct edits to `openspec/specs/*` SHALL be rejected by the API. Every proposed mutation produces a delta section in `changes/<name>/specs/<domain>.md`, validated against the delta grammar before write.

#### Scenario: ADDED requirement creates delta
- **WHEN** a user proposes adding requirement "Rate limiting" to domain "api" in change "add-rate-limit"
- **THEN** a delta spec section `## ADDED Requirements` with the requirement is written to `changes/add-rate-limit/specs/api.md` and the main spec is untouched

#### Scenario: Direct main-spec edit rejected
- **WHEN** an API call attempts to write directly to `openspec/specs/api/spec.md`
- **THEN** the request is rejected with a structured error explaining that main specs mutate only through change + archive (D-MainSpecCRUD)

#### Scenario: RENAMED references non-existent name
- **WHEN** a delta RENAMED section targets a requirement name that does not exist in the main spec
- **THEN** validation fails with a clear error naming the missing requirement

### Requirement: Scenario editing with Given/When/Then assistance
The system SHALL allow creating, editing, and deleting scenarios under a requirement inside a change's delta spec, with optional Given/When/Then assistance (opt-out; raw Markdown fallback preserved). Reordering scenarios SHALL rewrite only the scenario list region; every other byte is frozen (INV-2).

#### Scenario: Given/When/Then assist generates structured scenario
- **WHEN** a user fills the Given/When/Then assist fields and saves
- **THEN** the delta spec receives a `#### Scenario:` block with the structured content

#### Scenario: Raw mode preserves verbatim text
- **WHEN** a user writes raw Markdown for a scenario and saves
- **THEN** the raw text is preserved verbatim on save (no normalization) per INV-2

### Requirement: Spec validation with inline findings
The system SHALL run the documented upstream `openspec validate`-equivalent on a single spec file or the whole project. Findings SHALL be surfaced inline (per-line markers) and as a structured list. Coverage SHALL be 100% of the documented upstream rules (NFR-5); unknown rules tracked in a gap registry. Each finding includes severity, rule id, line/column, message, and suggested fix. "Apply suggested fix" SHALL be available for deterministic fixes, restricted to delta specs inside a change folder — never to main specs (D-MainSpecCRUD forbids direct main-spec mutation). Applying a fix to a main spec SHALL be rejected.

#### Scenario: Validation reports a missing scenario
- **WHEN** a requirement has no scenarios and the rule set requires at least one
- **THEN** a finding with severity error, the rule id, line number, and suggested fix is surfaced

#### Scenario: Validation on a valid spec
- **WHEN** the spec passes all documented rules
- **THEN** no error findings are reported (warnings may still surface for non-canonical markers)

#### Scenario: Apply deterministic fix to a delta spec
- **WHEN** a user clicks "Apply suggested fix" on a finding inside a change's delta spec
- **THEN** the fix is applied to the delta spec with a confirmation prompt and the delta re-validates

#### Scenario: Apply fix to a main spec rejected
- **WHEN** a user attempts to apply a fix to a main spec in `openspec/specs/`
- **THEN** the request is rejected with a structured error (D-MainSpecCRUD); the main spec is never mutated directly

### Requirement: Propose mutations enforce If-Match and emit audit records
Every propose-via-change endpoint that appends to an existing delta spec section SHALL enforce per-section `If-Match` (INV-7). Every propose-via-change endpoint SHALL emit an audit record (NFR-10) including action, change, domain, verb (ADDED/MODIFIED/REMOVED/RENAMED), and timestamp.

### Requirement: Spec search with index freshness
The system SHALL provide full-text search across all specs in a project. Search hits within a requirement SHALL scope to that requirement; clicking SHALL jump to it. The index SHALL refresh within 2 seconds of a write (NFR-6). Regex and fuzzy modes SHALL be available. Filtering by domain, RFC 2119 strength, "modified by active change", and date range SHALL be supported.

#### Scenario: Search hits a requirement
- **WHEN** a user searches "export" and the term appears in a requirement body
- **THEN** the result scopes to that requirement and clicking jumps to it

#### Scenario: Index freshness after write
- **WHEN** a delta spec is saved adding a new requirement
- **THEN** the new requirement is searchable within 2 seconds

#### Scenario: Search with no results
- **WHEN** a user searches a term not present in any spec
- **THEN** an empty results state is shown without error

### Requirement: Spec impact analysis with caching
The system SHALL show, for any spec, every active change whose delta touches it, broken down by verb (ADDED/MODIFIED/REMOVED/RENAMED) and per-requirement. The result SHALL be computed by parsing every `changes/*/specs/<domain>.md` and joining on domain + requirement UUID (D-ReqID). Results SHALL be cached per `(project, changeSetVersion)` and invalidated on any change edit. Conflicts (per the 6.4a matrix) SHALL be flagged with severity. Each impact row SHALL deep-link to the delta section in the change view.

#### Scenario: Impact shows two changes touching same domain
- **WHEN** changes A and B both have delta specs for domain "api"
- **THEN** the impact analysis lists both with their respective verbs per requirement

#### Scenario: Cache invalidated on change edit
- **WHEN** change A's delta spec is edited
- **THEN** the impact analysis cache for that project is invalidated and recomputed on next read

#### Scenario: Impact on a domain with no active changes
- **WHEN** a spec domain has no active change deltas touching it
- **THEN** the impact view shows an empty state ("no active changes touch this domain")
