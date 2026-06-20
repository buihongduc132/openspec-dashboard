## 1. Shared metrics module (foundation for all analytics)

- [ ] 1.1 Create `src/lib/metrics/project-metrics.ts` with pure functions: `activeChanges(projectId)`, `taskCompletion(projectId)`, `validationStatus(projectId)`, `lastActivity(projectId)`, `archivedCount(projectId)` — each a Drizzle read over existing tables. Write failing unit tests FIRST asserting the numbers against a seeded fixture (red), then implement (green).
- [ ] 1.2 Add `src/lib/metrics/rollup.ts` with `orgRollup()` that maps `project-metrics` over all projects and reduces to totals (active changes, open validation errors, aggregate task completion %). The aggregate task completion % is task-count-weighted: `sum(done) / sum(total) × 100`, NOT an average of per-project percentages. Unit test FIRST that the rollup equals the task-count-weighted formula, including the zero-projects case and the zero-tasks case (explicit "no tasks" state, no divide-by-zero).
- [ ] 1.3 Add a caching layer (in-memory, TTL = refresh window, default 60s) around metric functions with a stale-on-timeout fallback returning `{ value, computedAt, stale }`. Unit test the cache hit/miss/expiry/stale-fallback paths FIRST.
- [ ] 1.4 Wire a config knob `ANALYTICS_REFRESH_WINDOW_MS` + `ANALYTICS_QUERY_TIMEOUT_MS` in `.env.example`; document defaults.

## 2. Multi-project overview (analytics-multi-project)

- [ ] 2.1 Create `/api/analytics/multi-project` route returning org rollup + per-project health cards + sortable/filterable metadata. Integration test FIRST (testcontainers DB, seeded multi-project fixture) asserting the rollup and card shape; then implement.
- [ ] 2.2 Implement sort (health, activity, owner) and filter (same) with deterministic tie-breaking by project name. Unit test sort orderings FIRST including the empty-filter-result case.
- [ ] 2.3 Build the `/analytics/multi-project` page rendering health cards + org rollups; verify counts reconcile with the filesystem within the refresh window (integration test).
- [ ] 2.4 Build the cross-project activity heatmap component sourced from `audit_logs` grouped by day; each cell deep-links to the filtered activity feed. Unit test the day-bucketing + zero-activity-day rendering FIRST.

## 3. Spec coverage (analytics-coverage)

- [ ] 3.1 Create `src/lib/metrics/coverage.ts` computing per-domain: requirement count, scenario count, active-changes-touching, open validation errors. Unit test FIRST against a seeded fixture with a cold spot (0 requirements) and a hot spot (>10 active changes).
- [ ] 3.2 Add cold/hot-spot flagging with configurable thresholds (`COVERAGE_HOTSPOT_THRESHOLD` default 10, `COVERAGE_COLDSPOT_REQUIREMENTS` default 0). Unit test threshold configuration FIRST.
- [ ] 3.3 Build `/api/analytics/coverage` + the coverage matrix page; rows drill down to the domain spec view. Integration test the drill-down link target FIRST.
- [ ] 3.4 Render "Not validated" explicitly for domains with no validation run (never 0). Unit test FIRST that a never-validated domain surfaces the explicit state.

## 4. Archive analytics (analytics-archive)

- [ ] 4.1 Create `src/lib/metrics/archive.ts` computing archive frequency, average creation→archive duration, and most-modified spec domains across archives (from archive records + git history of the archive dir when available). Unit test FIRST with a fixture including a restored-then-re-archived change (INV-4a — counted as two events). Cover the non-git-folder case: git history is absent → compute from archive records only, surface a "git history unavailable" flag (no error).
- [ ] 4.2 Implement most-modified-domains ranking: a domain is "modified" by an archived change when it appears in any delta verb of the change's recorded requirement deltas; one modification per domain per change (NOT per requirement line). Deterministic name tie-breaking. Unit test the counting semantics FIRST (single change touching many requirements in one domain = +1, not +N) and the tie-break.
- [ ] 4.3 Build the slowest-changes leaderboard (top N, configurable, default 10) with deep-links to archived change detail. Unit test the cap + ordering FIRST.
- [ ] 4.4 Build `/api/analytics/archive` + page; integration test end-to-end against a seeded archive fixture.

## 5. Contributor analytics (analytics-contributor)

- [ ] 5.1 Create `src/lib/metrics/contributor.ts` computing per-author: tasks completed, changes archived, specs authored, validation errors introduced vs resolved. Validation error correlation key = tuple `(projectId, specDomain, requirementUUID, ruleId)` where requirementUUID is the D-ReqID stable identity (NOT the name); resolution attributed to the author whose change made the run pass; re-introduction after resolution counts as a second introduction. Audit events with no `author` go to an "unattributed" bucket. Unit test FIRST including: same-author resolve, other-author resolve, requirement-rename-correlation (UUID stable), re-introduction, and the missing-author case.
- [ ] 5.2 Implement server-side anonymity mode (`CONTRIBUTOR_ANONYMITY` flag): map authors to per-author stable pseudonyms computed as `"Contributor-" + first4hex(SHA256(rawAuthorId))` (NOT rank-order) before serialization; raw identifiers never reach the client. Unit test FIRST that toggling anonymity preserves counts, that pseudonyms are stable across renders, and that adding/removing/reordering contributors does NOT change any remaining author's pseudonym.
- [ ] 5.3 Build `/api/analytics/contributor` + page; assert via integration test that no ranking/leaderboard/gamification endpoint exists (return 404 for any ranking request — non-goal enforcement).
- [ ] 5.4 Add an audit-log entry reader for validation-error introduced-vs-resolved correlation (match error → later resolved-by-same-or-other author). Unit test the correlation logic FIRST.

## 6. Export / backup (project-export-backup)

- [ ] 6.1 Create `src/lib/export/manifest.ts` producing the versioned manifest (server version, schema versions, sidecar versions, content hashes, AND the resolved dashboard-metadata path per D-SidecarLoc). Unit test FIRST that the manifest round-trips and records all required versions + the resolved sidecar path.
- [ ] 6.2 Create `src/lib/export/tarball.ts` streaming a tarball of canonical `openspec/` + dashboard metadata dir + audit log + manifest, using `tar-stream`/Node `tar`. Integration test FIRST that the tarball contains all three layers + manifest for a seeded project, including the empty-audit-log case.
- [ ] 6.3 Create `/api/projects/[id]/export` GET streaming the tarball; emit an audit entry on completion with the manifest hash. Integration test FIRST.
- [ ] 6.4 Create `src/lib/export/restore.ts`: read manifest FIRST, validate version compatibility, refuse on mismatch without mutating the target. Unit test FIRST the compatible + incompatible-manifest cases.
- [ ] 6.5 Implement restore applying into a fresh registration by default; require explicit overwrite confirmation for a non-empty target; acquire per-section ETag locks (INV-7) at section granularity (stream one section at a time, never a whole-project lock), produce new ETags, and on a mid-stream 409 report succeeded-section count + rejected-section identifiers (sections already applied are NOT rolled back); emit audit entry. On a manifest sidecar-path mismatch with the target's resolved path, remap to the target's path, record the remap, and proceed. Integration test FIRST: fresh-target success, non-empty-without-confirmation rejection, concurrent-edit 409 on one section while others succeed, and sidecar-path remap.

## 7. UI modernization pass (release-publication)

- [ ] 7.1 Consolidate design tokens + spacing across Phase 1–3 components; presentation-only, no behavioral change. Run the full Phase 1–3 acceptance test suites FIRST as the regression baseline; they must pass unchanged after the pass.
- [ ] 7.2 Enforce NFR-1 via Lighthouse CI job (first-contentful paint budgets); fail the release on regression. Add the CI job.
- [ ] 7.3 Enforce NFR-2 via k6 read-latency load test (p50/p99 on analytics + existing read endpoints); fail the release on regression. Add the CI job.
- [ ] 7.4 Re-run NFR-9 a11y: axe-core per-component on modernized surfaces + manual AT scripts (NVDA/VoiceControl keyboard paths); document the manual AT pass results. Fail the release on any finding.

## 8. Docs + demo + contribution guide (release-publication)

- [ ] 8.1 Write the getting-started guide (local run, env, first project registration) versioned with the release.
- [ ] 8.2 Build a demo dataset loader that renders a representative multi-project state; verify the walkthrough renders without a real OpenSpec project (test the loader).
- [ ] 8.3 Write the contribution guide: dev setup, testing entry points (`npm run test`, `test:integration`, `test:coverage`), change-proposal workflow (`/opsx-propose`), the two-person publication gate checklist.

## 9. Publication gate (release-publication)

- [ ] 9.1 Add a CI job running `gitleaks detect --all-refs` + working-tree scan; fail on any finding. Document that a finding requires history rewrite + force-push before retry (per Phase 0.6 policy).
- [ ] 9.2 Document the two-person manual review checklist in the contribution guide; the gate governs subsequent sensitive releases (auth keys, production configs), not the already-completed initial push.

## 10. Verification

- [ ] 10.1 `npm run typecheck` and `npm run lint` pass with no new errors in Phase 4 files.
- [ ] 10.2 `npm run test:coverage` and `npm run test:integration:coverage` pass the `testing-standard` coverage gates for Phase 4 code (instrumentation ON); `npm run knip` reports no dead code.
- [ ] 10.3 `npm run knip` reports zero dead code introduced in Phase 4.
- [ ] 10.4 Manual: export a seeded project → tarball contains manifest + 3 layers; restore into a fresh registration succeeds; restore with an incompatible manifest refuses; restore onto a non-empty target without confirmation refuses.
- [ ] 10.5 Verifier-loop milestone: 2 fresh blind verifiers confirm coverage thresholds hold, no dead code, edge cases (zero-projects, zero-tasks aggregate, never-validated domain, restored-then-re-archived, missing-author, requirement-rename-correlation, re-introduced error, incompatible-manifest, concurrent-edit-on-restore one-section, sidecar-path remap, non-git-folder archive analytics, pseudonym stability across set change) are covered, and no Phase-1-owned scope (velocity/overview/timeline) was re-specced.
