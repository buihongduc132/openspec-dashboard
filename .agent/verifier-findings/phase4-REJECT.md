# Verifier REJECT — phase4-analytics-polish (Round 1)

REJECTED by blind verifier (@Verifier-12). Fix ALL 8 items, then resubmit the FULL change (proposal + specs + design + tasks), not a partial.

The three headline checks PASS (no 7.5 re-spec; 7.2 ≠ 1.6; no already-public re-litigation; testing-standard cited not restated; INV-4a + INV-7 honored; scenario-header compliance correct). The 8 REJECT items are **undefined semantics** — a metric or operation is mandated in the spec without a defined mechanism, so two compliant implementations produce different results. This is the "vague compliance" the verifier gate exists to kill. Define the mechanisms.

## REJECT items (define each in the spec, not just the design)

### 1. [MEDIUM] Validation-error "introduced vs resolved" correlation key undefined
`analytics-contributor` mandates "validation errors introduced versus resolved" (scenario shows "4 introduced / 3 resolved"). Neither spec nor task 5.4 defines the matching identity. DEFINE: what key correlates an introduced error to its later resolution? (Stable error ID? `(domain, requirement, rule)` tuple? Across how many validation runs?) Two implementations will produce different attribution numbers otherwise.

### 2. [MEDIUM] "Most-modified spec domains" counting semantics undefined
`analytics-archive` ranks domains by "how frequently they were modified across archived changes" sourced from "inverse-patch history". DEFINE what counts as a modification: a domain appearing in any delta verb (ADDED/MODIFIED/REMOVED/RENAMED)? Net requirement delta > 0? Any touch? The ranking shape depends on this.

### 3. [MEDIUM] Bulk-restore locking strategy undefined under INV-7
`project-export-backup` requires restore to "acquire the appropriate per-section locks and produce new ETags" and reject concurrent edits with 409. A full-project restore imports hundreds of sections. DEFINE the locking granularity: one transactional acquisition (deadlock risk)? per-file? per-section streamed? The 409 semantics + liveness depend on this. "Appropriate locks" is vague.

### 4. [MEDIUM] Aggregate task-completion % aggregation method undefined/contradictory
`analytics-multi-project` mandates "aggregate task completion percentage"; task 1.2 says rollup "reduces to totals (... aggregate task completion %)". A percentage cannot be totalled. DEFINE: is the aggregate (a) simple average of per-project percentages, or (b) task-count-weighted (total done / total tasks across all projects)? These diverge sharply (proj A: 100 tasks @50%, proj B: 1 task @100% → 75% vs 50.5%). Pick one and state the formula.

### 5. [LOW] Git-history dependency for archive analytics has no fallback
`analytics-archive` sources from "changes/archive/ + git history". Projects registered from non-git folders (allowed in Phase 1) have no git history. DEFINE behavior when git is absent: silent zero? error? degrade to archive-records-only? Add a scenario.

### 6. [LOW] Export manifest doesn't record the resolved sidecar location
D-SidecarLoc makes the sidecar location conditional (`openspec/.dashboard/` OR `<repo>/.openspec-dashboard/`). The manifest records "sidecar versions" but not WHICH path was exported → restore doesn't know where to write metadata. REQUIRE the manifest to record the source sidecar path, and define restore behavior when the target deployment resolved a different path.

### 7. [LOW] Pseudonym stability claim may be self-contradictory
`analytics-contributor` demands pseudonyms "stable across renders"; design D3 says "deterministic hash → Contributor A/B/C". Rank-ordered A/B/C labels are NOT stable when the contributor set changes (a new higher-ranked contributor shifts everyone's label). RESOLVE: either (a) change the spec to "stable per-author pseudonym" (e.g. hash → "Contributor-7A3F", label never changes regardless of rank), or (b) change the design to non-rank-ordered labels. State which.

### 8. [LOW] Implicit dependency on `tdd-coverage-standard` tooling landing first
Tasks 10.2/10.3 invoke `npm run test:coverage`, `test:integration:coverage`, `knip` — all owned by the `tdd-coverage-standard` change. STATE this as an explicit prerequisite in the proposal/design (Phase 4 verification is un-runnable until that change lands), mirroring how phase0-foundations task 1.1 declares the same blocker.

Resubmit the full change after all 8 are defined. 100%-pass-or-reject.
