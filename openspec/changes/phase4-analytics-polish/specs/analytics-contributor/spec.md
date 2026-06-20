## ADDED Requirements

### Requirement: Per-contributor attribution from audit log
The system SHALL compute, per contributor, the count of tasks completed, changes archived, specs authored, and validation errors introduced versus resolved. Attribution SHALL be derived from the audit log's `author` field.

#### Scenario: Contributor with mixed activity
- **WHEN** a contributor has completed 5 tasks, archived 2 changes, authored 3 specs, and introduced 4 validation errors of which 3 were later resolved
- **THEN** their contributor row shows 5 / 2 / 3 / 4 introduced / 3 resolved

#### Scenario: Missing author on an audit event
- **WHEN** an audit event has no `author` (e.g. a CLI-only action)
- **THEN** that event is attributed to an explicit "unattributed" bucket rather than dropped or misattributed to a default user

### Requirement: Validation-error introduced-vs-resolved correlation key
The system SHALL correlate a "validation error introduced" event to its later "resolved" event using a stable, deterministic identity: the tuple `(project id, spec domain, requirement UUID, failing rule id)`, where the requirement UUID is the stable server-side identity from D-ReqID (NOT the requirement name, which may be renamed). An error is counted as "resolved" for an author when a later validation run for the same tuple reports that rule as passing; the resolution is attributed to the author whose change caused the passing run. Correlation SHALL span an unbounded window across validation runs within the same project (a resolved error is never "forgotten" and re-counted). A tuple that is introduced, resolved, then re-introduced by a later change is counted as two introduced and one resolved.

#### Scenario: Error introduced and later resolved by same author
- **WHEN** an author's change causes rule R on requirement U to fail, and a later change by the same author makes rule R on U pass
- **THEN** that author's row shows 1 introduced and 1 resolved for that tuple

#### Scenario: Error introduced by one author, resolved by another
- **WHEN** author A's change fails rule R on requirement U, and author B's later change makes rule R on U pass
- **THEN** author A's row shows 1 introduced and 0 resolved for that tuple; author B's row shows 0 introduced and 1 resolved for that tuple

#### Scenario: Requirement renamed between runs
- **WHEN** an error is introduced against requirement name "foo" (UUID U), the requirement is renamed to "bar" (same UUID U per D-ReqID identity continuity), and a later run passes rule R on "bar" (UUID U)
- **THEN** the resolution correlates to the original introduction because the UUID is stable; the count is 1 introduced / 1 resolved

#### Scenario: Re-introduced error after resolution
- **WHEN** rule R on requirement U fails, later passes (resolved), then a subsequent change makes it fail again
- **THEN** the tuple is counted as 2 introduced and 1 resolved

### Requirement: Configurable anonymity mode
The system SHALL support a configurable anonymity mode for the contributor display. When enabled, contributor identifiers SHALL be replaced with stable pseudonyms so trends remain visible without exposing real identities. A pseudonym SHALL be stable per-author, computed as a deterministic function of the raw author identifier (NOT rank-order), so the label for a given author never changes regardless of how the contributor set or sort order changes. Pseudonyms SHALL take the form `Contributor-<4-hex-chars>` derived from the first 16 bits of a SHA-256 hash of the raw author identifier, guaranteeing label stability independent of ranking.

#### Scenario: Anonymity mode on
- **WHEN** anonymity mode is enabled and two contributors exist
- **THEN** their rows display per-author stable pseudonyms (e.g. "Contributor-7A3F", "Contributor-B2E1") consistently across renders and the raw identifiers are not sent to the client

#### Scenario: Pseudonym stable across rank and set changes
- **WHEN** a new contributor joins with higher activity than existing ones and the sort order changes, or a contributor leaves
- **THEN** each remaining author's pseudonym is unchanged because the label is derived from the author identifier, not the rank position

#### Scenario: Toggling anonymity preserves counts
- **WHEN** anonymity mode is toggled off after being on
- **THEN** the per-row counts remain identical to the prior render; only the identifier label changes

### Requirement: No performance or gamification signals
The system SHALL surface raw counts and trends only. It SHALL NOT compute rankings, badges, leaderboards, or any gamification signal, and SHALL NOT expose signals intended for performance review.

#### Scenario: Request for a ranking endpoint
- **WHEN** a caller requests a ranked contributor leaderboard
- **THEN** the system returns 404 / not-supported, because rankings are an explicit non-goal (req 7.7 non-goals)
