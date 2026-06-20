## 1. Task richness foundations

- [ ] 1.1 Write failing tests for swimlane grouping (change/domain/assignee/label/priority, "No lane" fallback, cell counts, collapse persistence per user); then implement `tasks-kanban-rich` swimlane renderer extending the Phase 1 board
- [ ] 1.2 Write failing tests for the task detail panel (deep-link `/project/<id>/task/<uuid>`, region-scoped Markdown edit, missing-task state); then implement the slide-out panel with related-requirements parsing from delta specs
- [ ] 1.3 Write failing tests for composable AND filters + named saveable views + active-filter count badge; then implement the filter bar + saved-view persistence + shareable URL
- [ ] 1.4 Write failing tests for search widened to comments + sub-checklist items with <2s index freshness (NFR-6) and filter scoping; then extend the Phase 1 search index to include comments and sub-checklists

## 2. Task metadata richness

- [ ] 2.1 Write failing tests for task dependencies (UUID-resolved cross-change, cycle rejection, uncompleted-blocker gates Done); then implement the dependency graph + drag-gate
- [ ] 2.2 Write failing tests for multi-assignee + non-member rejection when a member list exists (single-user-local accepts any string otherwise); then implement assignments sidecar field + avatar rendering
- [ ] 2.3 Write failing tests for project-scoped labels (independent taxonomies per project, accessible-contrast enforcement NFR-9); then implement label CRUD + multi-label + color picker
- [ ] 2.4 Write failing tests for threaded comments (append-mostly, cross-session-restorable delete, @-mention recording, search indexing); then implement `comments/<taskUuid>.jsonl` append log + audit emission
- [ ] 2.5 Write failing tests for sub-checklists (sidecar-only, INV-1 byte-fidelity, one-way convert-to-Markdown-task, search indexing); then implement sub-checklist storage + progress bar + convert action
- [ ] 2.6 Write failing tests for timezone-aware due dates (UTC storage, detected+override timezone display, overdue highlighting, no-target-date change warning); then implement due-date sidecar field + "due this week" filter

## 3. Alternate views + bulk ops

- [ ] 3.1 Write failing tests for the list view (persisted column show/hide/order per user, bulk-select + bulk-act); then implement the sortable filterable table
- [ ] 3.2 Write failing tests for the calendar view (month/week, drag-reschedule, read-only when no dated tasks); then implement the calendar with `@dnd-kit` drag-reschedule
- [ ] 3.3 Write failing tests for per-change progress + velocity rollup (excludes archived by default, velocity fed by Phase 0 audit log); then implement the progress/velocity aggregations
- [ ] 3.4 Write failing tests for bulk ops (atomic-per-change rollback, multi-change partial-failure report, destructive preview+confirm); then implement bulk move/assign/label/complete/delete

## 4. Real-time + concurrent merge

- [ ] 4.1 Write failing tests for SSE board updates (<2s propagation, polling fallback with degraded indicator); then implement the SSE route `/api/projects/[id]/events` + client subscriber
- [ ] 4.2 Write failing tests for the 3-way merge UI on 409 (yours/theirs/parent via `diff-match-patch`, validator-reject invalid merges, different-section concurrent success, presence indicators); then implement the merge modal + presence channel

## 5. Change richness

- [ ] 5.1 Write failing tests for the artifact dependency DAG (deterministic layout across reloads, click-through to artifact tab, invalid-status overlay); then implement the graph renderer with stable layout
- [ ] 5.2 Write failing tests for custom artifacts (unknown-template plain-Markdown editor, archive-includes custom artifacts, DAG/validation parity with built-ins); then implement custom-artifact tab/editor/badge flow
- [ ] 5.3 Write failing tests for file-level conflict detection 06.4b (per-file SHA-256 hash of each affected `specs/<domain>.md`; conflict when two changes both modify the same file, even in different sections; evolving-hash check during batch); then implement the per-file hash-compare detector
- [ ] 5.4 Write failing tests for bulk archive (topological order, lexicographic tie-break reproducibility, cycle rejection, per-project mutex with timeout, atomic all-or-nothing rollback on any change failure — mid-batch failure reverts all prior archives in the batch); then implement the bulk-archive endpoint extending the Phase 1 single-archive mutex
- [ ] 5.5 Write failing tests for change sync (idempotent re-sync, manual unsync cross-session via audit tombstone); then implement the sync sidecar record + apply/revert logic
- [ ] 5.6 Write failing tests for archive browsing + restore (chronological browse + filters, INV-4a unrestorable state with reason + "restore as new change" offer, audit-log entry with actor/timestamp/git-ref, 404 on missing archive); then implement the archive browser + restore endpoint honoring D-ArchiveSeq

## 6. Spec history + export

- [ ] 6.1 Write failing tests for spec version history (`git log`/`git blame` rendering, no shadow history, restore creates a NEW commit via change+archive, non-git repo empty state); then implement the history/blame views via `simple-git`
- [ ] 6.2 Write failing tests for spec export (verbatim Markdown byte-fidelity, versioned JSON schema, PDF with Given/When/Then emphasis + anchor index, empty-domain export); then implement Markdown/JSON/PDF export endpoints

## 7. Schema authoring

- [ ] 7.1 Write failing tests for schema creation (circular-requires rejection, non-kebab ID rejection, starter-template scaffold passes validation); then implement the create flow + validator
- [ ] 7.2 Write failing tests for schema forking (provenance in `openspec/.dashboard/schema-forks.json` not invented YAML key, diff-against-upstream, 404 on missing source); then implement the fork flow + provenance sidecar
- [ ] 7.3 Write failing tests for template management (variable autocomplete `{{name}}`/`{{context.*}}`/`{{date}}`, project-context preview, undefined-variable placeholder); then implement the template editor + preview
- [ ] 7.4 Write failing tests for schema activation (in-flight-change warning, per-change override respected, no retroactive mutation of existing changes); then implement activation writing `config.yaml` default-schema
- [ ] 7.5 Write failing tests for schema export/import (manifest with version+provenance, atomic import on validation failure, name-collision prompt); then implement tarball export/import

## 8. Heuristic verification

- [ ] 8.1 Write failing tests for the completeness dimension (missing-task CRITICAL finding, ADDED-requirement-without-scenarios CRITICAL); then implement completeness checks over parsed delta/spec/tasks AST
- [ ] 8.2 Write failing tests for correctness + coherence dimensions (keyword-overlap best-effort, orphan-design-decision WARNING); then implement the heuristic engine as pure TypeScript (no LLM — Phase 3b)
- [ ] 8.3 Write failing tests for advisory-vs-blocking behavior (`verify.required: true` gates archive; default advisory) and re-run-after-fix only reruns failures; then implement the verify endpoint + config check
- [ ] 8.4 Write failing tests for project-wide spec validation (aggregated report grouped by file, filterable by severity/file/rule-id, clean-project green); then implement the project-scope validator
- [ ] 8.5 Write failing tests for the validation dashboard (severity/file drill-down, audit-log-fed trend, empty-audit-log degraded state); then implement the dashboard view + drill-down

## 9. Dependencies, docs, verification

- [ ] 9.1 Add justified dev/runtime dependencies from design D1-D7 (`@dnd-kit/core`, `@dnd-kit/sortable`, `diff-match-patch`, `simple-git`, a YAML editor component); justify each in the PR description against design.md
- [ ] 9.2 Update `AGENTS.md` flow reference with a one-line pointer to each Phase 2 capability (tasks-kanban-rich, changes-archive-rich, specs-history, schemas-authoring, verification-heuristic)
- [ ] 9.3 Run `npm run test:coverage` and `npm run test:integration:coverage` (per `testing-standard` capability); confirm the `testing-standard` coverage gates pass for Phase 2 code (unit + integration with instrumentation ON + no dead code)
- [ ] 9.4 Run dead-code detection (`npm run knip`); remove any uncovered/unreferenced Phase 2 code (INV-9)
- [ ] 9.5 Verifier-loop milestone 2: 2 fresh blind verifiers check coverage + dead code + spec coverage for Phase 2 capabilities; reject and re-do until unanimous approve
