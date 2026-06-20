## ADDED Requirements

### Requirement: Versioned project export tarball
The system SHALL export an entire project's state — canonical filesystem snapshot, dashboard metadata, and audit log — as a single versioned tarball. The tarball SHALL include a manifest recording the server version, all schema/sidecar versions present, AND the resolved dashboard-metadata location (D-SidecarLoc: either `openspec/.dashboard/` or `<repo>/.openspec-dashboard/`) that was exported. Recording the resolved path enables restore to write metadata back to the correct location or report a mismatch when the target deployment resolved a different path.

#### Scenario: Export contains manifest and all three layers
- **WHEN** a project is exported
- **THEN** the tarball contains the canonical `openspec/` tree, the dashboard metadata directory, the audit log, and a `manifest.json` listing the server version, each schema/sidecar version, and the resolved sidecar path that was exported

#### Scenario: Export of a project with empty audit log
- **WHEN** a project with zero audit events is exported
- **THEN** the tarball still includes an (empty) audit log file and the manifest; the export does not fail

#### Scenario: Restore to a deployment that resolved a different sidecar path
- **WHEN** a tarball was exported from a deployment using `openspec/.dashboard/` but the target deployment resolved `<repo>/.openspec-dashboard/` (D-SidecarLoc fallback)
- **THEN** restore writes the imported metadata to the target deployment's resolved path (not the manifest's source path), records the path remap in the restore audit entry, and succeeds — the manifest's path is informational and does not block restore

### Requirement: Restore validates against current server version before applying
The system SHALL validate an imported tarball against the current server version and schema versions BEFORE applying any state. If the manifest's versions are incompatible with the running server, restore SHALL refuse and report the mismatch without mutating the target project.

#### Scenario: Compatible restore
- **WHEN** a tarball's manifest versions are within the server's supported range
- **THEN** the restore proceeds, importing the canonical tree, metadata, and audit log into the target project registration

#### Scenario: Incompatible manifest refuses restore
- **WHEN** a tarball was produced by a newer server version whose schema the running server cannot read
- **THEN** restore refuses, reports the version mismatch, and leaves the target project untouched

### Requirement: Restore into a fresh project registration
Restore SHALL import into a fresh project registration; it SHALL NOT merge into or overwrite an existing non-empty project without explicit confirmation. Restoring onto a non-empty target SHALL be rejected unless the user explicitly confirms an overwrite.

#### Scenario: Restore into fresh registration
- **WHEN** restore targets a newly created empty project registration
- **THEN** the import applies cleanly and the project is usable

#### Scenario: Restore onto non-empty target without confirmation
- **WHEN** restore targets a project that already has canonical artifacts and no overwrite confirmation was given
- **THEN** restore is rejected with a clear reason and the target is not modified

### Requirement: Export is audit-logged and ETag-consistent
Export and restore operations SHALL each emit an audit-log entry. Export SHALL respect per-section ETag concurrency (INV-7) for any read it performs against mutable sections. Restore, as a write, SHALL acquire per-section ETag locks at section granularity: restore SHALL stream sections one at a time, acquiring each section's lock immediately before writing that section and releasing it immediately after, and SHALL reject any section whose current ETag indicates a concurrent edit with a 409 per INV-7. Restore SHALL NOT acquire a single transactional lock across all sections (deadlock risk for large projects) and SHALL NOT lock at file granularity (coarser than INV-7 allows). Sections already imported before a 409 on a later section remain applied; the restore SHALL report which sections succeeded and which were rejected so the user can retry the remainder.

#### Scenario: Export emits audit entry
- **WHEN** an export completes
- **THEN** an audit-log entry records the export action, project, actor, and tarball manifest hash

#### Scenario: Restore concurrent with an edit on the same section
- **WHEN** a restore writes a section while another session edits the same section
- **THEN** the conflicting section write is rejected with a 409 per INV-7, and all other sections not under concurrent edit are still imported

#### Scenario: Partial restore on a mid-stream conflict
- **WHEN** a restore is importing 200 sections and a 409 occurs on section 137
- **THEN** sections 1–136 remain applied, the restore aborts section 137 with a 409, and the response reports the succeeded-section count and the rejected-section identifiers so the user can retry just those

#### Scenario: Restore lock granularity is per-section, not whole-project
- **WHEN** a large project restore is in progress
- **THEN** no single lock is held across all sections; a concurrent editor working on a section not yet reached by the restore is never blocked by the restore's already-completed sections
