## ADDED Requirements

### Requirement: Spec version history from Git
The system SHALL show the Git history of a spec file: commit, author, date, diff. The system SHALL provide a "blame" view mapping each requirement/scenario to the commit that last touched it. History SHALL come from `git log` / `git blame` on the underlying file with no shadow history. Restoring a prior version SHALL create a NEW commit (never rewriting history) via a change+archive path, and SHALL be logged in the audit trail.

#### Scenario: View commit history
- **WHEN** a user opens a spec file's history
- **THEN** the view lists commits touching that file with author, date, and a diff against the parent

#### Scenario: Blame maps a requirement
- **WHEN** a user opens blame on a spec
- **THEN** each requirement and scenario block is annotated with the commit that last touched it

#### Scenario: Restore prior version creates a new commit
- **WHEN** a user restores a prior version of a spec
- **THEN** the restoration goes through change+archive (D-MainSpecCRUD), creating a new commit on top of HEAD; history is never rewritten

#### Scenario: No shadow history
- **WHEN** the system renders history
- **THEN** the data comes directly from `git log`/`git blame`; there is no parallel history store to drift out of sync

#### Scenario: Repository without git
- **WHEN** a project's `rootPath` is not a git repository
- **THEN** history and blame are unavailable and the UI shows an explanatory empty state rather than crashing

### Requirement: Spec export
The system SHALL export a spec (or all specs in a domain) as Markdown (verbatim), PDF, or structured JSON (parsed AST). The JSON schema of the export SHALL be documented and versioned. PDF export SHALL render scenarios with Given/When/Then emphasis and a per-requirement anchor index.

#### Scenario: Verbatim Markdown export
- **WHEN** a user exports a spec as Markdown
- **THEN** the downloaded file is byte-identical to the canonical spec file (INV-1, INV-2)

#### Scenario: Structured JSON export
- **WHEN** a user exports a spec as JSON
- **THEN** the output is a valid JSON object conforming to the documented, versioned export schema (domain, requirements[], scenarios[])

#### Scenario: PDF anchor index
- **WHEN** a user exports a spec as PDF
- **THEN** the PDF includes a per-requirement anchor index and Given/When/Then steps rendered with emphasis

#### Scenario: Export an empty domain
- **WHEN** a user exports a domain with no spec files
- **THEN** the Markdown export is empty, the JSON export is a valid empty-domain object, and the operation does not error
