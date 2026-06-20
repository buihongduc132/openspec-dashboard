## Why

After Phase 0 delivers the parser, filesystem projection, audit log, and API foundation, the dashboard needs a **usable single-project tool**. This phase builds the core modules that let users work with specs, changes, tasks, and schemas — plus the dashboard surfaces that make the data visible and actionable. Phase 1 is the first time the dashboard becomes genuinely useful, not just structurally sound.

This phase focuses on **read + propose-via-change** for specs (no direct main-spec edits per D-MainSpecCRUD), **change lifecycle + single archive** (bulk archive is Phase 2), **task sidecar + kanban board** (rich task features like dependencies/comments/swimlanes are Phase 2), **schema read + validate** (schema authoring is Phase 2), and **project overview + activity timeline + velocity** (org-level analytics are Phase 4). The gate is: a single user can fully manage one OpenSpec project through the dashboard, from registration to archive.

## What Changes

- **specs-module**: List specs (req 02 §2.1), render spec detail (2.2), propose requirements via change deltas (2.3), propose scenarios (2.4), validate specs (2.5), search specs (2.7), impact analysis (2.8). **NOT** version history (2.6 — Phase 2) or export (2.9 — Phase 2).
- **changes-module**: List changes (req 03 §3.1), render change detail (3.2), create changes (3.3), edit metadata (3.4), track artifact status (3.5), validate changes (3.6), proposal/design/delta/task editors (3.7-3.10), **single archive** (3.13 with inverse-patch restore). **NOT** artifact dependency graph viz (3.11 — Phase 2), custom artifacts (3.12 — Phase 2), bulk archive (3.14 — Phase 2), change sync (3.15 — Phase 2), archive browsing/restore UI (3.16 — Phase 2, though the restore logic is in 3.13).
- **tasks-kanban**: Sidecar metadata contract (req 04 §4.1), task parsing (4.2), task serialization (4.3), kanban board (4.4), task cards (4.5), drag & drop (4.6), task CRUD (4.11), reconciliation algorithm (4.21), markdown import/export (4.22), real-time updates + concurrent-edit merge UI (4.24). **NOT** swimlanes (4.7 — Phase 2), task detail panel (4.8 — Phase 2), filtering (4.9 — Phase 2), search (4.10 — Phase 2), dependencies (4.12 — Phase 2), assignments (4.13 — Phase 2), labels (4.14 — Phase 2), comments (4.15 — Phase 2), checklists (4.16 — Phase 2), due dates (4.17 — Phase 2), list view (4.18 — Phase 2), calendar view (4.19 — Phase 2), progress tracking (4.20 — owned by dashboard-overview below), bulk ops (4.23 — Phase 2).
- **schemas-module-read**: Schema listing (req 05 §5.1), schema detail (5.2), schema validation (5.7), schema resolution debug (5.9). **NOT** schema creation (5.3 — Phase 2), forking (5.4 — Phase 2), editor (5.5 — Phase 3), template management (5.6 — Phase 2), activation (5.8 — Phase 2), export/import (5.10 — Phase 2).
- **conflict-detection-requirement-level**: Requirement-level conflict detection (req 06 §6.4a) — the full matrix (ADDED/MODIFIED/REMOVED/RENAMED combinations). **NOT** file-level conflict detection (6.4b — Phase 2).
- **dashboard-overview**: Project overview (req 07 §7.1), activity timeline (7.3), task velocity (7.5), **and progress tracking (req 04 §4.20 — per-change progress bar + per-project rollup + exclude-archived filter; §7 matrix maps 4.20 to Phase 1.5, which is this phase's dashboard sub-phase)**. **NOT** multi-project overview (7.2 — Phase 4), spec coverage (7.4 — Phase 4), archive analytics (7.6 — Phase 4), contributor analytics (7.7 — Phase 4).
- **NFR measurement plumbing**: Lighthouse CI (NFR-1), k6 load test (NFR-2), axe-core a11y + manual AT for DnD (NFR-9).

## Capabilities

### New Capabilities

- `specs-module`: Read surfaces for specs + propose-via-change for requirements/scenarios + validation + search + impact analysis (req 02 §2.1-2.5, 2.7, 2.8).
- `changes-module`: Change lifecycle (list, detail, create, edit, validate, archive with inverse-patch restore) — single archive only (req 03 §3.1-3.10, 3.13).
- `tasks-kanban`: Task sidecar + kanban board + reconciliation + drag-drop + CRUD + import/export + real-time concurrent-edit merge (req 04 §4.1-4.6, 4.11, 4.21, 4.22, 4.24). **Refines** the existing `tasks-kanban` spec from `build-openspec-dashboard-mvp` (which only covered UUID identity, reconciliation, and basic kanban).
- `schemas-module-read`: Schema listing, detail, validation, resolution debug (req 05 §5.1, 5.2, 5.7, 5.9).
- `conflict-detection-requirement-level`: Requirement-level conflict matrix (req 06 §6.4a).
- `dashboard-overview`: Project overview, activity timeline, task velocity, and progress tracking (req 07 §7.1, 7.3, 7.5; req 04 §4.20 — per-change progress bar + per-project rollup, exclude-archived filter; §7 maps 4.20 to Phase 1.5 which is this phase).
- `nfr-measurement`: CI measurement plumbing — Lighthouse CI (NFR-1), k6 load test (NFR-2), axe-core per-component a11y + manual AT for DnD (NFR-9), index-freshness probe (NFR-6).

### Modified Capabilities

_None. All capabilities are new for this phase. The existing `tasks-kanban` spec from `build-openspec-dashboard-mvp` is refined (expanded) by this phase's `tasks-kanban` capability, but that's not a "modified capability" in the OpenSpec sense — it's a phased delivery of a single capability._

## Impact

- **Code**: New route areas (`/projects/[id]/specs/*`, `/projects/[id]/changes/*`, `/projects/[id]/kanban`, `/projects/[id]/schemas/*`, `/projects/[id]` overview), new API endpoints for spec/change/task/schema CRUD + validation + archive + reconciliation, new Drizzle queries for analytics, new client components for editors + kanban board + dashboard tiles.
- **APIs**: ~30 new endpoints across specs, changes, tasks, schemas, validation, archive, dashboard. All read-mostly except task CRUD, change creation/edit/archive, and spec propose-via-change (which writes delta specs, not main specs).
- **Dependencies**: Minimal new runtime deps — perhaps a markdown parser (if not already present), a drag-and-drop library (dnd-kit recommended, but library-health recheck per Phase 0), a diff library for the concurrent-edit merge UI (e.g. `diff-match-patch`). Justified in design.md.
- **Data**: No schema migrations. All data lives in the canonical OpenSpec filesystem (`openspec/specs/`, `openspec/changes/`, `openspec/schemas/`) plus the dashboard sidecar (`openspec/.dashboard/tasks/`).
- **Systems**: Real-time board updates (req 04 §4.24) require WebSocket or polling; polling with optimistic UI is acceptable for Phase 1. NFR measurement (Lighthouse/k6/axe) runs in CI, not production.
- **Testing**: Cites `testing-standard` (TDD discipline + coverage gates from `tdd-coverage-standard`); every module gets tests written first. See design.md D1.
