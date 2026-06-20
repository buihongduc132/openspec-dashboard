## ADDED Requirements

### Requirement: Archive frequency and average change duration
The system SHALL compute, per project and across projects, archive frequency (archives per time window) and the average change duration from creation to archive. Both SHALL be sourced primarily from the archived change records; git history of the archive directory SHALL be used as a supplemental source when available. A project whose root is not a git repository (allowed in Phase 1 registration) SHALL NOT error — the system SHALL compute archive analytics from archived change records alone in that case, and SHALL surface a visible "git history unavailable — archive records only" notice on the affected surfaces.

#### Scenario: Average duration across archives
- **WHEN** a project has three archived changes with durations of 2, 10, and 6 days
- **THEN** the average change duration is reported as 6 days

#### Scenario: No archived changes
- **WHEN** a project has zero archived changes
- **THEN** archive frequency and average duration render an explicit "no archives yet" empty state, not zero or null

#### Scenario: Non-git project degrades to archive-records-only
- **WHEN** a project was registered from a non-git folder and has archived change records
- **THEN** archive frequency and average duration are computed from the archived change records, the git-history-sourced supplemental data is skipped, and the surface shows a "git history unavailable" notice

### Requirement: Most-modified spec domains across archives
The system SHALL rank spec domains by how frequently they were modified across archived changes, surfacing the domains that change most often. A domain is counted as "modified" by an archived change when that change's inverse-patch (the recorded set of requirements the change added, modified, removed, or renamed) references the domain — i.e. the domain appears in any delta verb of the change's recorded requirement deltas. Each archived change contributes at most one modification per domain regardless of how many requirements it touches within that domain, so the count is "number of archived changes that touched the domain", not "number of requirement lines changed". Restored-then-re-archived changes (INV-4a) contribute one modification per archive event.

#### Scenario: Ranking reflects inverse-patch history
- **WHEN** archived changes A, B, C modified domain X twice, domain Y once, and domain Z never
- **THEN** the most-modified ranking lists X first, then Y, and omits Z

#### Scenario: Tie in modification count
- **WHEN** two domains are modified the same number of times across archives
- **THEN** the tie is broken deterministically by domain name so the ranking is stable across renders

#### Scenario: Single change touching many requirements in one domain counts once
- **WHEN** an archived change added 5 requirements and modified 3 more all in domain X
- **THEN** domain X's modification count increments by exactly 1 for that change, not 8

### Requirement: Slowest changes leaderboard
The system SHALL surface a "slowest changes" leaderboard listing the archived changes with the longest creation-to-archive duration, to surface bottlenecks. Each entry SHALL deep-link to the archived change.

#### Scenario: Leaderboard capped and linked
- **WHEN** the user views the slowest-changes leaderboard
- **THEN** it shows the top N (configurable, default 10) slowest archived changes, each linking to its archived change detail

#### Scenario: Change restored then re-archived
- **WHEN** a change was archived, restored, and re-archived with a new higher archive sequence (INV-4a)
- **THEN** each archive event is counted separately in archive frequency and duration, using each event's own creation-to-archive span
