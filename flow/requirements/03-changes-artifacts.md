# Requirements 03 — Changes & Artifacts

> The change is the unit of in-flight work and the ONLY mutation path for main specs
> (D-MainSpecCRUD). Cross-cutting INV-1, INV-2, INV-4, INV-4a, INV-6, INV-7 apply.

## 3.1 Change listing

**Shall:** List every active (non-archived) change under `openspec/changes/<name>/` with:
name, schema, artifact completion badges, creation date, initiative link, task completion %,
validation status.

**AC:**
- (a) Artifact badges reflect file presence + non-empty + valid.
- (b) Sort by creation, last-modified, task completion; filter by schema, initiative,
  validation status.

## 3.2 Change detail

**Shall:** Render a change as tabs: Overview, Proposal, Design, Specs (delta), Tasks. Each
tab renders the artifact Markdown with structured parsing where applicable.

**AC:**
- (a) Overview shows: `.openspec.yaml` metadata, artifact dependency DAG (status overlay),
  validation status, linked initiative, impact summary.
- (b) Tabs degrade gracefully when an artifact is absent per schema; never crash.

## 3.3 Change creation

**Shall:** Create a new change: name (kebab-case, uniqueness-checked), schema selection
(resolution-aware per findings doc), optional description/goal/areas. Scaffolds
`changes/<name>/` from the chosen schema's templates plus a `.dashboard/` metadata stub.

**AC:**
- (a) Scaffolded canonical files pass `openspec validate` immediately.
- (b) Schema template variables injected at scaffold per `config.yaml` rules.
- (c) Optional artifacts created empty-but-present when schema marks them
  `apply.requires: false` and the user opts in.

## 3.4 Change metadata edit

**Shall:** Edit `.openspec.yaml` (name, initiative, description, areas, status) through a
form + raw YAML editor with live validation. Renames move the folder atomically.

**AC:**
- (a) Folder rename uses `git mv` inside a git repo; **outside a git repo**, a plain
  filesystem rename is used and the behavior is documented (no history to preserve).
- (b) Rename updates references in: server-side workspace manifests, server-side initiative
  links, other changes' dependencies — with preview + confirm.

## 3.5 Artifact status tracking

**Shall:** Compute per-artifact status from the schema DAG: **done**, **ready**, **blocked**,
**invalid** (definitions in plan glossary).

**AC:**
- (a) Status recompute is event-driven (file change) not polling.
- (b) Visual DAG renders the schema's dependency graph with status colors; click-through
  to the artifact editor.

## 3.6 Change validation

**Shall:** Run `openspec validate <change>`-equivalent on demand or on save; surface
results inline on each artifact and as a unified report.

**AC:**
- (a) Validation covers: structural integrity, schema conformance, delta-spec grammar,
  requirement-name collisions, orphan references.
- (b) Errors block archive; warnings surface but do not block.

## 3.7 Proposal editor

**Shall:** Rich Markdown editor for `proposal.md` with section assistance (Intent, Scope
in/out, Approach) and live validation.

**AC:**
- (a) Section assist is template-driven from the schema; users may deviate (free-form).
- (b) Auto-save drafts to a `.dashboard/drafts/proposal.json` entry (versioned sidecar
  record, status `draft`), NOT a new unversioned `.draft` file. Canonical `proposal.md`
  written only on explicit save.

## 3.8 Design editor

**Shall:** Rich Markdown editor for `design.md` with sections: Technical Approach,
Architecture Decisions (ADR-style: context / decision / consequences), Data Flow, File
Changes.

**AC:**
- (a) ADR sub-entries render as a numbered list and can be reordered without losing prose.
- (b) File Changes section has an assisted "add file path" picker (path autocomplete from
  the repo, not the openspec tree).

## 3.9 Delta spec editor

**Shall:** Structured editor for `changes/<name>/specs/<domain>.md` with section verbs
ADDED / MODIFIED / REMOVED / RENAMED. Provides a **visual diff** against the matching main
spec, predicting the post-archive result.

**AC:**
- (a) "Preview archive result" renders the main spec with this delta applied — read-only,
  byte-accurate to what archive would produce.
- (b) MODIFIED sections show a 3-way diff (main / delta / predicted).
- (c) RENAMED sections enforce old-name existence in main spec (else validation error).

## 3.10 Task editor

**Shall:** Interactive checklist editor for `tasks.md`: hierarchical groups, checkboxes,
drag-reorder. Numeric labels (`1`, `1.1`, …) are **computed on read from sidecar order** and
never persisted to canonical Markdown as identity. Max nesting depth is a **dashboard
constant** (`MAX_TASK_DEPTH = 3`), not an invented schema field.

**AC:**
- (a) Display numbering is deterministic and stable across reorderings (derived from
  sidecar `order` + parent chain).
- (b) Canonical `tasks.md` numbering is left as the user wrote it; the dashboard does not
  rewrite numbers (INV-2).

## 3.11 Artifact dependency graph visualization (owned: Phase 2)

**Shall:** Render the schema's artifact dependency DAG as an interactive graph with status
overlay (done/ready/blocked/invalid).

**AC:**
- (a) Graph layout is stable across reloads (deterministic positions).
- (b) Clicking a node opens the artifact editor at the right tab.

## 3.12 Custom artifact support (owned: Phase 2)

**Shall:** Honor custom artifacts beyond the built-in 4 when the project uses a custom
schema. Each custom artifact gets a tab, editor, and badge.

**AC:**
- (a) Custom artifacts without a known template render as a plain Markdown editor.
- (b) Custom artifacts appear in the DAG, validation, and archive flow identically to
  built-ins.

## 3.13 Change archive

**Shall:** Archive a change: apply delta specs to main specs (inverse-patch recorded for
restore), move folder to `changes/archive/YYYY-MM-DD-<name>/`, emit a git commit (when in a
git repo) with a machine-readable commit message.

**AC:**
- (a) Archive gated by: all `apply.requires` artifacts present + valid, no unresolved
  conflict with another active change on the same requirement (full matrix in req 06 §6.4).
- (b) Restore reverts the spec merges using the recorded inverse-patch, **unless** a newer
  archived change has since modified the same requirement — in which case restore enters the
  INV-4a "unrestorable" state with the reason recorded. Restore is cross-session (tombstone
  + inverse-patch in audit log).
- (c) Archive preserves the original delta files inside the archived folder (audit trail).

## 3.14 Bulk archive

**Shall:** Select multiple changes and archive them. Detect inter-change conflicts using
the FULL conflict matrix (req 06 §6.4), including file-level conflicts at archive time.
Resolve by ordering or interactive disambiguation.

**AC:**
- (a) Conflict detection runs across the whole selected set BEFORE any archive, including
  file-level edits to the same `specs/<domain>.md`.
- (b) Archive order is topological w.r.t. inter-change dependencies (e.g., change A
  ADVERTISES a requirement that change B MODIFIED → A archives first).

## 3.15 Change sync (no archive)

**Shall:** Sync delta specs into main specs WITHOUT archiving, for long-running changes.
Produces a sidecar record of what was synced and when, so re-sync is idempotent.

**AC:**
- (a) Re-sync detects already-applied deltas and skips them.
- (b) Manual unsync reverts the last sync batch (cross-session; tombstoned in audit log,
  not session memory).

## 3.16 Archive browsing & restore

**Shall:** Browse `changes/archive/` chronologically, filter by date range and name, search
content. Restore moves an archived change back to active and reverts its spec merges
(subject to INV-4a).

**AC:**
- (a) Restore fails loudly (INV-4a "unrestorable" state) if reverting the merge would
  conflict with a newer change's modifications; reason recorded; user offered "restore as a
  new change instead".
- (b) Every archive/restore is recorded in the audit log with actor + timestamp + git ref.
