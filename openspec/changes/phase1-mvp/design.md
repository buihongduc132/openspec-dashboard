## Context

Phase 0 lands the engine: OpenSpec parser, filesystem projection, per-section ETag middleware, audit hash-chain, OpenAPI skeleton, secret hygiene, threat model. Phase 1 builds the user-facing MVP on top of that engine — a single-project, no-auth tool. The current repo already has Next.js 16 App Router + Drizzle + Postgres scaffolded route shells under `src/app/projects/[id]/{specs,changes,kanban}` and a kanban board component; this change fills those shells with real behavior wired to Phase 0's projection + audit + ETag layer.

Constraints: server components read from the projection (Phase 0); client components own interactivity (board DnD, editors); all mutating endpoints enforce per-section ETag (INV-7) and emit to the Phase 0 audit chain (NFR-10). No auth surface. Everything ships test-first per the `testing-standard` capability (INV-9 / D-TDD / NFR-12); coverage and dead-code gates are referenced, not restated.

## Goals / Non-Goals

**Goals:**
- One coherent MVP: read specs, propose-via-change, run a change through to single-archive, manage tasks on an accessible Kanban board, read+validate schemas, see overview/timeline/velocity.
- Deterministic sidecar reconciliation (§4.21) so task identity is stable across external renumbering.
- Per-section ETag correctness on every mutating endpoint so concurrent edits never silently overwrite (INV-7).
- NFR measurement wired from day one of Phase 1, including the DnD manual AT pass (NFR-9 / WCAG 2.2 2.5.7).

**Non-Goals:**
- Phase 2 task richness (swimlanes, dependencies, comments, sub-checklists, multi-change bulk-ops).
- Phase 2 change richness (artifact-graph viz, custom artifacts, bulk archive, change sync, archive browsing).
- Phase 2 spec richness (version history/blame, export).
- Phase 2 schema authoring; Phase 3b visual schema editor (D-SchemaEditor).
- Multi-user, RBAC, teams, git integration, webhooks, agent API (Phase 3a/3b).
- Multi-project analytics (Phase 4).

## Decisions

### D-P1-1: dnd-kit for the board, with a documented fallback
**Decision:** Use `@dnd-kit/core` + `@dnd-kit/sortable` for the Kanban board. Recheck library health at Phase 0; if unfit, fall back to `react-dnd`. Both pointer and keyboard sensors are configured from day one (2.5.7 Dragging Movements).

**Why:** dnd-kit has first-class keyboard/touch sensors (essential for NFR-9), is accessibility-oriented, and tree-shakes well. react-dnd is the documented fallback to avoid single-vendor lock-in.

**Alternatives:** Building a custom pointer-only DnD (rejected — fails 2.5.7 and the manual AT pass), native HTML5 DnD (rejected — poor touch + a11y).

### D-P1-2: Reconciliation is a pure, deterministic function
**Decision:** `reconcileTasks(markdownTuples, sidecarEntries)` is a pure function returning `{ bindings, orphans, advisories }`. It is called on every read. The consumed-set + lexicographic-UUID tie-break are the only binding rules (§4.21). No heuristics, no ML, no `prose-hash`.

**Why:** Determinism is the contract (§4.21 AC (a)); purity makes it trivially testable with property-based round-trips and is a clean seam for the verifier-loop.

**Alternatives:** Content-hash binding (rejected by §4.21 — collides on identical prose), fuzzy matching (rejected — non-deterministic, churns bindings).

### D-P1-3: Single-archive holds a per-project mutex with rollback
**Decision:** Archive acquires a project-scoped mutex, applies deltas to in-memory main specs, runs validation, and only then performs `git add` + `git commit` (in a repo) or atomic file writes (outside). On any git failure the in-memory deltas are discarded so spec-file and git state never diverge. The inverse-patch is appended to the audit log BEFORE the commit so restore is cross-session. Archive sequence numbers come from the Phase 0 `archive-seq.json` (D-ArchiveSeq) and are assigned inside the mutex.

**Why:** INV-4/INV-4a require cross-session restorability and unrestorable-on-conflict; the mutex + rollback + audit-before-commit ordering guarantees spec/git/audit never disagree.

**Alternatives:** Optimistic no-mutex archive (rejected — concurrent archives corrupt main specs), crypto-shred for restore (rejected by D-AuditRetention).

### D-P1-4: Impact analysis cache keyed by changeSetVersion
**Decision:** Cache key = `(projectId, changeSetVersion)` where `changeSetVersion` is a monotonic counter bumped on any change-folder mutation (create/edit/archive). Cache invalidation = bump the version. Stored in the projection's metadata table.

**Why:** Real-time recomputation on every read is too slow for NFR-2 on large projects; a version-keyed cache invalidates precisely on the only event that changes the result, with no stale window.

**Alternatives:** TTL cache (rejected — stale reads, violates §6.4a "real-time"), per-request recompute (rejected — NFR-2).

### D-P1-5: 3-way merge via diff-match-patch on section text
**Decision:** Concurrent same-section edits return 409 + a 3-way merge UI (yours / theirs / parent) using `diff-match-patch` on the section text. The parent is the ETagged section bytes from the last accepted write. Resolution is a new write with a fresh ETag.

**Why:** Per-section ETag (INV-7) makes the merge unit small (one section, not a whole file), so a text-level merge is sufficient and avoids a heavyweight structured-Markdown merge engine. diff-match-patch is battle-tested and tiny.

**Alternatives:** File-level merge (rejected — violates INV-7's per-section scope), structured AST merge (over-engineered for Phase 1, deferred).

### D-P1-6: FTS via Postgres `tsvector` (Postgres mode) or SQLite FTS5 (SQLite mode)
**Decision:** Search uses `tsvector` + GIN index on Postgres (the project's primary DB) and FTS5 on SQLite (single-user-local). Both satisfy NFR-6 (≤2s refresh) via a write-triggered reindex.

**Why:** The repo already supports both DBs (D-SQLite); using each engine's native FTS avoids a new dependency and matches INV-8 (searchable by default).

**Alternatives:** A separate search index (Meilisearch/Typesense — rejected, adds a service for Phase 1), trigram-only (weaker relevance).

### D-P1-7: Schema module is read-only with a hard capability boundary
**Decision:** No schema mutation endpoints ship. The schema module exposes list/detail/validate/resolution-debug only. A runtime guard in the route layer rejects any schema mutation so a future Phase 2 change can enable them deliberately.

**Why:** D-SchemaEditor and the plan explicitly defer authoring to Phase 2 and the visual editor to Phase 3b. A hard boundary prevents accidental scope creep and is trivially testable (a 405 on POST).

**Alternatives:** Stub mutation endpoints "for later" (rejected — dead code, violates INV-9's no-dead-code rule).

## Risks / Trade-offs

- **[dnd-kit upstream churn]** A breaking release mid-phase could destabilize the board. → Library-health recheck at Phase 0 (per plan); react-dnd fallback documented; pin exact versions.
- **[Reconciliation ambiguity in the wild]** Users with heavily-duplicated prose could see many low-confidence bindings. → Advisory UI prompts once and stores state; no churn; the consumed-set guarantees correctness even if prompts are ignored.
- **[Archive mutex contention]** A long-running archive blocks concurrent archives on the same project. → Accepted (correctness > throughput for a single-user MVP); mutex is project-scoped so other projects are unaffected; documented as a Phase 2 throughput concern.
- **[FTS divergence across DB engines]** Postgres tsvector and SQLite FTS5 have slightly different tokenizers, so ranking may differ per deployment. → Accepted for Phase 1 (single-user-local is SQLite, server is Postgres); a relevance-parity property test catches gross divergence.
- **[Manual AT pass scheduling]** NVDA/VoiceOver/JAWS testing depends on human availability and could slip the phase gate. → Scheduled early (not at the end); keyboard-interaction scripts are automated and gate CI independent of the manual pass; the manual pass is a phase-exit checklist item, not a CI job.
- **[Impact cache invalidation missed]** If a mutation path forgets to bump `changeSetVersion`, the cache goes stale. → A single helper `bumpChangeSetVersion(projectId)` called from every change-folder mutation, with a contract test asserting the version bumps on each mutation type (NFR-10-style contract test).
