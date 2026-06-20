## ADDED Requirements

### Requirement: Artifact dependency graph visualization
The system SHALL render the schema's artifact dependency DAG as an interactive graph with status overlay (done / ready / blocked / invalid). Graph layout SHALL be stable across reloads (deterministic positions). Clicking a node SHALL open the artifact editor at the right tab.

#### Scenario: Deterministic layout across reloads
- **WHEN** a user loads the artifact DAG for a change, reloads, and loads it again
- **THEN** node positions are identical across all three loads for the same schema

#### Scenario: Click-through to artifact
- **WHEN** a user clicks the "design" node in the DAG
- **THEN** the change detail view switches to the design tab

#### Scenario: Invalid artifact flagged
- **WHEN** an artifact fails validation
- **THEN** its DAG node renders in the "invalid" state with a click-through to the finding list

### Requirement: Custom artifact support
The system SHALL honor custom artifacts beyond the built-in 4 when the project uses a custom schema. Each custom artifact SHALL get a tab, an editor, and a status badge. Custom artifacts without a known template SHALL render as a plain Markdown editor. Custom artifacts SHALL participate in the DAG, validation, and archive flow identically to built-ins.

#### Scenario: Unknown-template custom artifact
- **WHEN** a schema defines a custom artifact with no known template
- **THEN** that artifact renders as a plain Markdown editor in the change view

#### Scenario: Custom artifact in archive
- **WHEN** a change with a custom artifact is archived
- **THEN** the custom artifact file is copied into the archive folder alongside the built-ins

### Requirement: Bulk archive with full conflict matrix
The system SHALL let the user select multiple changes and archive them as a batch. Before any archive, the system SHALL run the full conflict matrix across the selected set, including **file-level conflict detection (req 06.4b)** at archive time. File-level conflict detection SHALL compare per-file SHA-256 hashes of all affected spec domains; a conflict exists when two changes both modify the same spec-domain file (regardless of which sections within the file they touch). Archive order SHALL be topological with respect to inter-change dependencies; cycles in the inter-change dependency graph SHALL be rejected with a clear error directing the user to split a change. Topo tie-break SHALL be deterministic (lexicographic on change name) so the final main-spec state is reproducible regardless of selection order. Bulk archive SHALL be atomic: either all selected changes archive successfully, or none archive. If any change in the batch encounters a conflict, validation error, or other failure, the entire batch SHALL be rejected with a detailed error listing which change(s) failed and why; no partial archive state SHALL persist.

#### Scenario: File-level conflict detected
- **WHEN** two selected changes both edit the same `specs/<domain>.md` (even in different sections)
- **THEN** the per-file SHA-256 hashes reveal the file-level conflict before any archive and the system presents the conflict to the user for resolution

#### Scenario: File-level conflict, different sections
- **WHEN** change A edits the "Findings" section of `specs/domain-a.md` and change B edits the "Requirements" section of the same file
- **THEN** file-level conflict is detected (per-file hash matches) and the batch is rejected with instructions to merge the changes or serialize the archives

#### Scenario: Topological order
- **WHEN** change A ADDS a requirement that change B MODIFIES
- **THEN** A archives before B; after archive, B's MODIFIED references A's new version

#### Scenario: Cycle rejected
- **WHEN** the selected set has A adds R that B modifies AND B adds S that A modifies
- **THEN** the bulk archive is rejected with an error naming the cycle and suggesting which change to split; no archive runs

#### Scenario: Deterministic tie-break
- **WHEN** two unrelated changes both add different requirements
- **THEN** they archive in lexicographic order on change name, and the final main-spec state is identical regardless of the original selection order

#### Scenario: Partial failure atomicity
- **WHEN** a bulk archive of changes [A, B, C] runs, A archives successfully but B fails validation
- **THEN** the entire batch rolls back, A's archive is reverted, no main-spec writes persist, and the error lists B's failure reason; the user can fix B and retry the batch

#### Scenario: Mid-batch failure on change C
- **WHEN** a bulk archive of changes [A, B, C] runs, A and B archive successfully but C fails
- **THEN** all archives (including A and B) are rolled back atomically, the main-spec state is unchanged, and the error lists C's failure reason

### Requirement: Change sync without archive
The system SHALL let the user sync a change's delta specs into main specs WITHOUT archiving, for long-running changes. The system SHALL produce a sidecar record of what was synced and when; re-sync SHALL detect already-applied deltas and skip them (idempotent). Manual unsync SHALL revert the last sync batch, cross-session (tombstoned in the audit log, not session memory).

#### Scenario: Idempotent re-sync
- **WHEN** a user syncs change X, then syncs it again without edits
- **THEN** the second sync detects the already-applied deltas, applies nothing new, and reports "no new changes"

#### Scenario: Manual unsync restores main spec
- **WHEN** a user triggers manual unsync on the last sync batch
- **THEN** the main spec is reverted to its state before the sync; the action is recorded in the audit log

#### Scenario: Unsync across server restart
- **WHEN** a sync occurs, the server restarts, and the user triggers unsync
- **THEN** the unsync still succeeds because the sync record is cross-session

### Requirement: Archive browsing and restore
The system SHALL let the user browse `changes/archive/` chronologically, filter by date range and name, and search content. Restore SHALL move an archived change back to active and revert its spec merges, subject to INV-4a: if reverting the merge would conflict with a newer change's modifications, restore SHALL fail loudly with an "unrestorable" state and a recorded reason, and offer the user "restore as a new change instead". Every archive and restore SHALL be recorded in the audit log with actor + timestamp + git ref.

#### Scenario: Browse archive chronologically
- **WHEN** a user opens the archive browser
- **THEN** archived changes appear in reverse-chronological order and can be filtered by date range and name

#### Scenario: Restore conflict with newer change
- **WHEN** restoring an archived change would conflict with a newer archived change's modifications to the same requirement UUID (D-ReqID)
- **THEN** the restore fails with an unrestorable state, a recorded reason, and offers "restore as a new change instead"

#### Scenario: Audit-log entry on restore
- **WHEN** a restore succeeds
- **THEN** the audit log records actor, timestamp, git ref, and the restored archive folder

#### Scenario: Non-existent archive
- **WHEN** a user attempts to restore an archive by an id that does not exist
- **THEN** the system returns a 404 with an error body
