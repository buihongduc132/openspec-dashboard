## Why

After Phases 0–3 deliver a functional, multi-user, integrated dashboard, the product still lacks the cross-project visibility that distinguishes a portfolio tool from a per-project one, and the codebase needs a final hardening pass before a public open-source release. This change delivers the Phase 4 slice: org-level analytics (multi-project overview, spec coverage, archive analytics, contributor analytics), the export/backup capability, the UI modernization pass with enforced NFRs, public-release documentation, and the publication gate that governs all subsequent sensitive releases.

## What Changes

- Add a **multi-project overview dashboard** (req 7.2) — org-level rollups (total active changes, total open validation errors, aggregate task completion %), per-project health cards, sortable/filterable, plus a cross-project activity heatmap. **Distinct from req 1.6** (the single-project card on the project list page); this is the org-level rollup dashboard with shared metric computation.
- Add a **spec coverage heatmap** (req 7.4) — spec domains × metric (requirement count, scenario count, active changes touching, validation errors); cold/hot-spot flags; drill-down to the domain's spec view.
- Add **archive analytics** (req 7.6) — archive frequency, average change duration (creation → archive), most-modified spec domains across archives, "slowest changes" leaderboard. Sourced from `changes/archive/` + git history + audit log.
- Add **contributor analytics** (req 7.7) — per-user tasks completed, changes archived, specs authored, validation errors introduced vs resolved. Attribution from the audit log; "unattributed" bucket for CLI-only actions; configurable anonymity mode.
- Add **export/backup** (req 8.8) — versioned tarball of an entire project (canonical filesystem snapshot + dashboard metadata + audit log) with a versioned manifest; restore validates against the current server version before applying.
- Run the **UI modernization pass** (4.2) — design-system consolidation, perf budget enforcement (NFR-1 first-contentful paint, NFR-2 API p50/p99), accessibility audit re-run (NFR-9 incl. manual AT testing).
- Add **docs + demo + contribution guide** (4.3).
- Establish the **publication gate** (req 09 §9.8, Phase 4.4) — two-person manual, secret-scanned (history + working tree), governing subsequent sensitive releases. **Note:** the repo was already made public (commits `e8a516f` + `39cb79b`) before gitleaks hooks existed; Phase 0.6 retroactively scanned the pushed history. This gate governs releases FROM Phase 4 onward (auth keys, production configs), not the initial push.

**Explicitly NOT in this change (already owned elsewhere):**
- Velocity chart (req 7.5) — already in Phase 1.5 (project overview); data source ships in Phase 0.
- Project overview (req 7.1), activity timeline (req 7.3) — Phase 1.5.

## Capabilities

### New Capabilities
- `analytics-multi-project`: Org-level rollup dashboard (req 7.2) — cross-project health cards, org aggregates, activity heatmap; shared metric computation reused by the per-project card view.
- `analytics-coverage`: Spec coverage heatmap (req 7.4) — domain × metric matrix with cold/hot-spot detection.
- `analytics-archive`: Archive analytics (req 7.6) — frequency, duration, most-modified domains, slowest-changes leaderboard.
- `analytics-contributor`: Contributor analytics (req 7.7) — per-user attribution with unattributed bucket and configurable anonymity.
- `project-export-backup`: Versioned project export tarball + version-validated restore (req 8.8).
- `release-publication`: Docs + demo + contribution guide + two-person secret-scanned publication gate (4.3, 4.4, req 09 §9.8).

### Modified Capabilities
<!-- None — Phase 4 introduces these surfaces fresh. The UI modernization pass touches existing Phase 1–3 components but does not change spec-level behavior; it is tracked as a task under release-publication, not a modified capability. -->

## Impact

- **Code**: New route areas (`/analytics/*`), new read-only Drizzle queries over the existing `audit_logs`, `changes`, `tasks`, `specs`, `requirements` tables; new export endpoint + tarball builder; a shared `lib/metrics/` module for the metric computations reused across 7.2/7.1/1.6; UI modernization touches components from earlier phases (non-behavioral).
- **APIs**: New read-only endpoints under `/api/analytics/*` (multi-project, coverage, archive, contributor) and `/api/projects/[id]/export`. No existing endpoints change behaviorally.
- **Dependencies**: Tarball streaming via Node `tar` (already available) or `node-tar` — justified in design. Chart rendering via an existing or lightweight library (justified in design); no heavyweight charting framework.
- **Data**: No schema migrations. All analytics are derived read-only views over existing tables; contributor attribution reads `audit_logs.author`.
- **Systems**: Analytics queries are aggregation-heavy; mitigated by caching (reusing the Phase 1.5 impact-analysis cache pattern) and the existing audit-log indexes.
- **Release**: Phase 4.4 gate is a process gate (two-person, secret-scanned), not code; documented in the contribution guide.
- **Testing**: Cites `testing-standard` (the TDD discipline + coverage gates from `tdd-coverage-standard`); every analytic query and the export/restore path get tests written first. See design D4.

## Prerequisites

This change depends on the `tdd-coverage-standard` change landing first: Phase 4 verification tasks (10.2 `npm run test:coverage`, 10.3 `npm run test:integration:coverage`, `npm run knip`) invoke the Vitest unit + integration projects, coverage instrumentation, and the knip dead-code gate that `tdd-coverage-standard` provisions. Those scripts are NOT runnable until `tdd-coverage-standard` is applied. This mirrors how `phase0-foundations` declares the same blocker. Phase 4's own tasks still write failing tests FIRST (red → green) as required by INV-9; only the CI gate tooling is inherited.
