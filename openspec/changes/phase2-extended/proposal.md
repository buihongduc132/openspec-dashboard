## Why

Phase 1 ships a usable single-project MVP: a kanban board with default columns, a change lifecycle with single-archive, spec read + propose, and schema read + validate. But it stops well short of the Wekan/Vikunja feature parity the dashboard is meant to reach, and it leaves change-archive conflict detection at requirement-level only (06.4a). Phase 2 closes that gap within a single project — the rich task surface teams expect (swimlanes, dependencies, comments, sub-checklists, bulk ops, list/calendar views, concurrent-edit merge), the rich change surface (artifact dependency graph, custom artifacts, bulk archive with file-level conflict detection, change sync, archive browse/restore with the INV-4a unrestorable state), spec version history + export, schema authoring (raw YAML only — visual editor is Phase 3b per D-SchemaEditor), and the heuristic verification tier (D-Verify). No auth, no external integrations — those are Phase 3.

## What Changes

- **Task richness**: add swimlanes (group by change/domain/assignee/label/priority), task detail panel, composable + saveable filters, full-text search widened to comments + sub-checklist items (INV-8), task dependencies (UUID-resolved, cycle-rejected), multi-assignee, project-scoped labels, threaded comments (append-only JSONL), sub-checklists (sidecar-only), timezone-aware due dates, sortable list view, month/week calendar view with drag-reschedule, per-change progress + velocity rollup, and bulk operations (move/assign/label/complete/delete) atomic per change folder.
- **Concurrent-edit merge UI**: real-time board updates (<2s) plus the 3-way merge UI on per-section ETag (INV-7) 409s, with presence indicators. Replaces silent-overwrite risk with an explicit merge.
- **Change richness**: interactive artifact dependency DAG (status overlay), custom-artifact support (tabs/editors/badges for schemas beyond the built-in 4), **bulk archive** using the full conflict matrix including **file-level conflict detection (06.4b)** at archive time, **change sync** (apply deltas without archiving, idempotent re-sync, manual unsync), and **archive browsing + restore** honoring the INV-4a unrestorable state.
- **Spec richness**: spec version history (git log/blame; restoring a prior version creates a NEW commit via change+archive, never rewrites history) and spec export (Markdown verbatim, PDF, versioned JSON AST).
- **Schema authoring**: create custom schemas (no circular `requires`, unique kebab artifact IDs, scaffolds dir + templates), fork existing schemas with dashboard-side provenance (`openspec/.dashboard/schema-forks.json` — NOT an invented upstream key), template management with variable autocomplete + preview, schema activation (writes `config.yaml` default-schema with in-flight-change warning), and schema export/import (tarball with manifest, atomic import). **Visual editor is NOT included** — Phase 3b per D-SchemaEditor; raw YAML only here.
- **Heuristic verification**: run the `/opsx:verify`-inspired heuristic pass (completeness / correctness / coherence) over a change with severity-tagged findings, project-wide spec validation, and a validation dashboard with trend fed by the Phase 0 audit log. The LLM tier is explicitly **NOT** here (Phase 3b).
- All code follows the project `testing-standard` (TDD-first, coverage gates, no dead code) — cited by reference, not restated.

## Capabilities

### New Capabilities
- `tasks-kanban-rich`: Phase 2 task/kanban richness — swimlanes, detail panel, filters, comment/sub-checklist search, dependencies, assignments, labels, comments, sub-checklists, due dates, list view, calendar view, progress/velocity, bulk ops, real-time updates + concurrent-edit merge UI. Owns req 04.7–4.10, 4.12–4.20, 4.23, 4.24.
- `changes-archive-rich`: Phase 2 change richness — artifact dependency graph, custom artifacts, bulk archive with full conflict matrix + file-level 06.4b detection, change sync, archive browsing + restore (INV-4a). Owns req 03.11, 03.12, 03.14, 03.15, 03.16, 06.4b.
- `specs-history`: Phase 2 spec richness — git-backed version history/blame and spec export (Markdown/PDF/versioned JSON). Owns req 02.6, 02.9.
- `schemas-authoring`: Phase 2 schema authoring — create, fork (dashboard-side provenance), template management, activation, export/import. Raw YAML editor only (visual editor deferred to Phase 3b per D-SchemaEditor). Owns req 05.3, 05.4, 05.6, 05.8, 05.10.
- `verification-heuristic`: Phase 2 verification — `/opsx:verify`-inspired heuristic pass, project-wide spec validation, validation dashboard. Owns req 06.1 (heuristic tier only), 06.2, 06.3.

### Modified Capabilities
<!-- openspec/specs/ is empty (greenfield). All capabilities above are NEW. Phase 1 capabilities (specs-module, changes-module, tasks-kanban, schemas-module-read, dashboard-overview) are extended here but not yet archived to main specs, so they appear as NEW sibling capabilities scoped to Phase 2 rather than MODIFIED deltas. -->

## Impact

- **Code**: New route handlers + UI for swimlanes/detail/list/calendar views, dependency graph, bulk archive, sync, archive browser, spec history/blame/export, schema create/fork/template/activate/export-import, and the verification dashboard. New server modules for file-level conflict detection (hash compare at archive), change sync idempotency records, and the heuristic verifier. Extends the Phase 1 sidecar schema (comments/sub-checklists/dependencies already defined in §4.1 but not yet implemented).
- **APIs**: New read + mutating endpoints for each capability above; the per-section ETag (INV-7) and audit-emission (NFR-10) contracts from Phase 0 are extended to every new mutating endpoint. Bulk-archive endpoint holds the per-project archive mutex (req 03.13(d)) across the whole selected set.
- **Dependencies**: A Markdown-aware merge library (e.g. `diff-match-patch`) for the 3-way merge UI; a graph-layout library for the artifact DAG (deterministic positions per req 03.11(a)); a PDF renderer for spec export. All justified in design.md. No new runtime services.
- **Data**: Sidecar schema bumps where comments/sub-checklists/dependencies/sync-records land (each bump ships a tested migrator per §4.1(a)); dashboard-side `schema-forks.json` and sync-idempotency sidecar records. No canonical-OpenSpec format changes (INV-1).
- **Systems**: Heuristic verifier runs are CPU-bound but non-blocking (advisory unless `verify.required: true`); real-time board updates need a push channel (SSE or socket) within the existing Next.js server — design picks one. No new external services.
- **Testing**: Every capability cites `testing-standard`; tasks include test-first steps; the Phase 2 verifier-loop milestone checks coverage + dead code before approval.
