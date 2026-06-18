# Requirements 02 — Specs, Requirements, Scenarios

> Main specs are **accepted requirements**. Per D-MainSpecCRUD: the dashboard does NOT
> mutate `openspec/specs/*` directly. All main-spec mutation goes through a **change +
> archive**. This file describes **read** surfaces and **change-mediated proposal**
> surfaces. Cross-cutting INV-1, INV-2, INV-4, INV-6, INV-7, INV-8 apply.

## 2.1 Spec listing

**Shall:** List every spec domain under `openspec/specs/<domain>/*.md` as cards/rows:
domain name, requirement count, scenario count, last-modified, linked-active-changes count.

**AC:**
- (a) Counts derived from the live filesystem parse, not a cache older than the refresh
  window.
- (b) Filter by domain, by "has active changes", by requirement count range.

## 2.2 Spec detail (rendered, read-only)

**Shall:** Render a spec file as Markdown with a structured outline sidebar:
Spec → Requirements → Scenarios. Clicking an outline item scrolls to and highlights it.

**AC:**
- (a) Rendering mirrors GitHub-flavored Markdown + the OpenSpec heading contract
  (`### Requirement:`, `#### Scenario:`).
- (b) "View raw" shows the verbatim file with no transformation.
- (c) An inline banner states "main specs are mutated via changes" with a CTA to create a
  change targeting this domain.

## 2.3 Requirement — propose via change (NOT direct CRUD)

**Shall:** The dashboard offers a "Propose requirement change" action that creates (or
appends to) a change's delta spec with the appropriate verb (ADDED / MODIFIED / REMOVED /
RENAMED). Direct edits to `openspec/specs/*` are rejected by the API.

**AC:**
- (a) Every proposed requirement mutation produces a delta section in some
  `changes/<name>/specs/<domain>.md`, validated against the delta grammar before write.
- (b) Soft-delete of a *proposed* (not-yet-archived) requirement is a sidecar tombstone in
  the change's `.dashboard/` metadata, persisted across sessions (INV-4). The canonical
  main spec is never annotated with `# REMOVED` or any non-OpenSpec marker.
- (c) Renaming a proposed requirement updates only the delta spec's RENAMED verb section;
  it does NOT rewrite other open changes' deltas automatically (that is a conflict the
  conflict detector surfaces — req 06 §6.4).

## 2.4 Scenario — propose via change

**Shall:** Create / edit / delete scenarios under a requirement **inside a change's delta
spec**, with Given/When/Then assistance (opt-out; raw fallback preserved).

**AC:**
- (a) Given/When/Then assist is opt-out; raw Markdown mode preserved verbatim on save
  (INV-2 region-scoped).
- (b) Reordering scenarios rewrites only the scenario list region; every other byte frozen.

## 2.5 Spec validation

**Shall:** Run the documented upstream `openspec validate`-equivalent on a single spec file
or the whole project. Surface findings inline (per-line markers) and as a structured list.

**AC:**
- (a) Coverage = 100% of the **documented** upstream rules (NFR-5). Unknown rules (because
  upstream source is bundled) are tracked in a gap registry with a Phase 0 task to obtain
  the source.
- (b) Each finding: severity (error/warning), rule id, line/col, message, suggested fix.
- (c) "Apply suggested fix" available for deterministic fixes; confirmation required.

## 2.6 Spec version history (owned: Phase 2)

**Shall:** Show the Git history of a spec file: commit, author, date, diff. "Blame" view
maps each requirement/scenario to the commit that last touched it.

**AC:**
- (a) History comes from `git log`/`git blame` on the underlying file; no shadow history.
- (b) Restoring a prior version creates a NEW commit (never rewrites history) via a
  change+archive path, and is logged in the audit trail.

## 2.7 Spec search

**Shall:** Full-text search across all specs in a project. Filter by domain, by RFC 2119
strength, by "modified by active change", by date range.

**AC:**
- (a) Search hits within a requirement scope to that requirement; clicking jumps to it.
- (b) Index refresh ≤ 2s after a write (NFR-6).
- (c) Regex + fuzzy modes available.

## 2.8 Spec impact analysis

**Shall:** For any spec, show every active change whose delta touches it, broken down by
verb (ADDED / MODIFIED / REMOVED / RENAMED) and per-requirement.

**AC:**
- (a) Computed by parsing every `changes/*/specs/<domain>.md` and joining on domain +
  requirement **UUID** (D-ReqID). Result is cached per `(project, changeSetVersion)` and
  invalidated on any change edit; cache hit serves NFR-2 p99 < 500ms on large projects.
- (b) Conflicts (see req 06 §6.4 for the full matrix) flagged with severity.
- (c) Deep-link from impact row → the delta section in the change view.

## 2.9 Spec export (owned: Phase 2)

**Shall:** Export a spec (or all specs in a domain) as Markdown (verbatim), PDF, or
structured JSON (parsed AST).

**AC:**
- (a) JSON schema of the export is documented and versioned.
- (b) PDF export renders scenarios with Given/When/Then emphasis and a per-requirement
  anchor index.

**Non-goals:** Word/.docx export; live-linked exports (export is a snapshot).
