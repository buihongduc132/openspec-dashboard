## ADDED Requirements

### Requirement: Tenant isolation of the conflict comparison set
The cross-repo conflict comparison set SHALL be scoped to the caller's per-project roles. Only linked repos where the caller holds at least the Viewer role SHALL be read into the signature index or shown in results; repos the caller has no role on SHALL be excluded from the comparison set entirely, so their requirement signatures are never parsed, hashed, indexed, or returned. This filter SHALL be applied structurally at the query layer (a join against `project_roles`), not as a post-fetch filter that a query path could bypass. A repo the caller can read in one workspace but not in another SHALL NOT leak across workspace scopes.

#### Scenario: Caller lacks a role on one linked repo
- **WHEN** a user holds Viewer on repo A but no role on repo B, and both are linked into workspace W
- **THEN** only A's requirement signatures are read and indexed; B's signatures are never parsed, hashed, or returned, and no conflict involving B is reported to the caller

#### Scenario: No post-fetch bypass
- **WHEN** any code path builds the conflict comparison set
- **THEN** the role filter is enforced by a database-level join against `project_roles` (deny-by-default), so a query that forgets to filter cannot return data from a repo the caller cannot read

#### Scenario: Cross-workspace scope does not leak
- **WHEN** a user holds Viewer on repo R inside workspace W1 but has no access to R inside workspace W2
- **THEN** a conflict query run in the W2 scope returns nothing from R, even though the same repo is visible in W1

### Requirement: Exact-signature cross-repo conflict detection
Within a workspace, the system SHALL detect conflicts where two repos' active changes touch semantically equivalent requirements, scoped to the caller-readable comparison set above. The matching key SHALL be the normalized signature `(domain, lowercased-kebab-name, scenario-heading-hashes, RFC-2119-strength-set)`. Matching SHALL be exact-match only; near-matches SHALL be surfaced as "review candidates" with a confidence label and SHALL NEVER be auto-merged.

#### Scenario: Exact signature conflict detected
- **WHEN** two repos in a workspace have active changes that modify requirements with identical normalized signatures
- **THEN** both are listed as conflicts in the cross-repo conflict view, labeled with the conflicting repo pair

#### Scenario: Near-match surfaced as review candidate
- **WHEN** two repos' requirements have similar but not identical signatures
- **THEN** they appear as "review candidates" with a confidence label and are NOT treated as confirmed conflicts

#### Scenario: No auto-merge
- **WHEN** the system identifies a near-match review candidate
- **THEN** no merge or auto-resolution occurs; the user must explicitly dismiss or act

### Requirement: Conservative matching with published false-positive rate
Matching SHALL be conservative (exact-signature). The false-positive rate SHALL be measured on a fixture corpus and SHALL meet the Phase 3a gate threshold before the feature ships.

#### Scenario: Corpus false-positive gate met
- **WHEN** the matcher runs over the Phase 3a fixture corpus
- **THEN** the false-positive rate is at or below the gate threshold and the number is published with the change

#### Scenario: Corpus precision/recall reported
- **WHEN** the matcher is evaluated
- **THEN** both precision and recall are computed and reported so the conservative boundary is verifiable

### Requirement: Dismissable false positives
A user SHALL be able to dismiss a false-positive conflict. The dismissal SHALL be recorded in the audit log. The cross-repo conflict view SHALL be sortable by repo pair.

#### Scenario: Dismiss a false positive
- **WHEN** a user dismisses a flagged conflict as a false positive
- **THEN** it is removed from the active conflict view and the dismissal is audit-logged

#### Scenario: Sort by repo pair
- **WHEN** a user sorts the cross-repo conflict view by repo pair
- **THEN** conflicts are ordered by the (repoA, repoB) pair labels

### Requirement: Recompute trigger and staleness labeling
The conflict index SHALL be recomputed when a change in any linked repo is written or archived, and on workspace open if the index is older than a defined staleness window. Every reported conflict result SHALL carry a `computedAt` timestamp so the user can see how fresh it is. If a linked repo is mid-sync when a recompute is requested, the system SHALL either wait for the sync to finish or label the result as stale with the syncing repo's name — it SHALL NOT silently compute over a half-synced repo.

#### Scenario: Write triggers recompute
- **WHEN** a change is written or archived in a repo linked into workspace W
- **THEN** the cross-repo conflict index for W is recomputed before the next conflict-view read

#### Scenario: Result labeled with compute timestamp
- **WHEN** a user opens the cross-repo conflict view
- **THEN** each result (or the view as a whole) displays the `computedAt` timestamp so staleness is visible

#### Scenario: Mid-sync repo does not corrupt the index
- **WHEN** a recompute is requested while one linked repo is mid-sync
- **THEN** the system either waits for the sync to finish or labels the result as stale naming the syncing repo; it does not compute over a half-synced repo
