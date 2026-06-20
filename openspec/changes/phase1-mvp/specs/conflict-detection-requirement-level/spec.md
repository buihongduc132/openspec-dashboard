## ADDED Requirements

### Requirement: Requirement-level conflict matrix (real-time)
The system SHALL detect every pairwise conflict between active changes touching the same spec domain at the requirement level. The full matrix SHALL be implemented: ADDED+ADDED (same R), ADDED+MODIFIED, ADDED+REMOVED, ADDED+RENAMED, MODIFIED+MODIFIED, MODIFIED+REMOVED, MODIFIED+RENAMED, REMOVED+REMOVED (no conflict — idempotent), REMOVED+RENAMED, RENAMED+RENAMED, and any verb referencing an orphaned R. Matching SHALL use requirement UUID (D-ReqID) where the UUID exists; requirements not yet assigned a UUID SHALL be matched by name as a fallback, with the UUID assigned and recorded at first-seen. The conflict surface SHALL be real-time (recomputed on any change edit).

#### Scenario: ADDED vs ADDED same requirement
- **WHEN** two active changes both ADDED a requirement named "Rate Limiting" to the same domain
- **THEN** a conflict is surfaced indicating the duplicate add with the suggestion to rename or merge

#### Scenario: MODIFIED vs REMOVED
- **WHEN** change A MODIFIES requirement R and change B REMOVES requirement R
- **THEN** a conflict is surfaced asking to decide the fate of R before either archives

#### Scenario: REMOVED vs REMOVED (no conflict)
- **WHEN** two changes both REMOVED the same requirement R
- **THEN** no conflict is surfaced (idempotent removal is allowed)

#### Scenario: Orphan reference detected
- **WHEN** a change's delta references a requirement that no other change or main spec defines
- **THEN** an orphan-reference conflict is surfaced with the offending reference

### Requirement: Archived-to-active drift detection
After a change archives, the system SHALL detect any active change whose delta touches a requirement the archive just modified or removed. Those active changes are stale — their expected base is wrong. The drift detector SHALL run on every archive and surface stale active changes for rebase.

#### Scenario: Active change stale after archive
- **WHEN** change A archives after modifying requirement R, and active change B also modifies R
- **THEN** change B is flagged as stale (its expected base is now wrong) and surfaced for rebase

#### Scenario: No drift on unrelated archive
- **WHEN** change A archives after modifying requirement R, and no active change touches R
- **THEN** no stale flags are raised

### Requirement: Conflicts must resolve before archive
All conflicts involving a change MUST be resolved before that change can archive. The conflict-resolution UI SHALL offer: archive order suggestion, side-by-side merge editor, or "split the requirement" (creates two distinct requirements).

#### Scenario: Archive blocked by unresolved conflict
- **WHEN** a change has an unresolved conflict with another active change
- **THEN** archive is blocked with the specific conflict identified

#### Scenario: Archive succeeds after resolution
- **WHEN** a conflict between two changes is resolved (e.g., one renames its requirement)
- **THEN** both changes are eligible to archive

#### Scenario: Split requirement resolution
- **WHEN** a user chooses "split the requirement" for an ADDED vs ADDED conflict
- **THEN** two distinct requirements are created, resolving the conflict for both changes
