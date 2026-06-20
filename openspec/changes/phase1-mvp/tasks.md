## 1. Spec module (req 02 §2.1–2.5, 2.7, 2.8 + §6.4a)

- [ ] 1.1 Write failing tests for spec-domain listing (counts from projection, filters, parse-error badge); then implement the list route + page
- [ ] 1.2 Write failing tests for read-only spec detail (outline nav, view-raw, banner CTA); then implement the detail route + page
- [ ] 1.3 Write failing tests for propose-via-change (ADDED/MODIFIED/REMOVED/RENAMED delta writes, direct-main-spec rejection D-MainSpecCRUD, delta-grammar validation INV-6, per-section If-Match INV-7, NFR-10 audit emission); then implement the proposal endpoints
- [ ] 1.4 Write failing tests for scenario propose (Given/When/Then opt-out, region-scoped rewrite INV-2); then implement scenario endpoints
- [ ] 1.5 Write failing tests for spec validation (structured findings, gap-registry honesty, suggested fixes restricted to delta specs only — main-spec apply-fix rejected D-MainSpecCRUD); then implement the validator
- [ ] 1.6 Write failing tests for spec search (FTS via tsvector/FTS5, ≤2s freshness NFR-6, requirement-scoped hits); then implement the search index + endpoint
- [ ] 1.7 Write failing tests for impact analysis (cache key `(project, changeSetVersion)`, invalidation on change edit, deep-links); then implement impact + cache with a `bumpChangeSetVersion` contract test
- [ ] 1.8 Write failing tests for §6.4a conflict matrix (all rows incl. REMOVED/REMOVED no-conflict, name→UUID first-seen fallback, archived→active drift); then implement the conflict detector
- [ ] 1.9 Integration test: full propose→validate→impact→conflict flow against a testcontainer DB; assert line coverage instrumentation is ON

## 2. Change module (req 03 §3.1–3.10, 3.13)

- [ ] 2.1 Write failing tests for change listing (artifact badges, archived exclusion, sort/filter); then implement the list route + page
- [ ] 2.2 Write failing tests for change detail tabs (graceful degradation, Overview DAG, impact summary); then implement the detail route + page
- [ ] 2.3 Write failing tests for change creation (kebab validation, uniqueness, scaffold passes validate, NFR-10 audit emission); then implement create endpoint + scaffold
- [ ] 2.4 Write failing tests for metadata edit (git mv rename vs plain rename, YAML round-trip, reference update preview, per-section If-Match INV-7, NFR-10 audit emission); then implement metadata endpoints
- [ ] 2.5 Write failing tests for artifact status DAG (event-driven recompute); then implement status computation wired to projection file events
- [ ] 2.6 Write failing tests for change validation (errors block archive, warnings don't); then implement the validator + unified report
- [ ] 2.7 Write failing tests for artifact editors (delta preview byte-accuracy, task numbering from sidecar, draft-to-sidecar not canonical, per-section If-Match on save, NFR-10 audit emission); then implement the editors
- [ ] 2.8 Write failing tests for single-archive (inverse-patch, mutex serialization, git-failure rollback, INV-4a unrestorable, cross-session restore); then implement archive + restore with the per-project mutex
- [ ] 2.9 Integration test: create→edit→archive→restore (and unrestorable-restore) against testcontainer DB; confirm audit chain entries and git state consistency

## 3. Task sidecar + Kanban (req 04 §4.1–4.6, 4.11, 4.21, 4.22, 4.24)

- [ ] 3.1 Write failing tests for sidecar v1 (schemaVersion, UUID first-seen, distinct UUIDs on identical prose, lazy migrator); then implement the sidecar store + migrator
- [ ] 3.2 Write failing tests for reconciliation purity (consumed-set, lexicographic tie-break, orphans never deleted, advisory <0.5 once, idempotency, property-based round-trips); then implement the pure `reconcileTasks` function
- [ ] 3.3 Write failing tests for parse/serialize round-trip (non-task prose preserved INV-2, over-nested → raw lane, marker normalization); then implement parse + serialize
- [ ] 3.4 Write failing tests for board view (default columns, isDone flag, UUID-survives-renumber, degraded read-only without sidecar); then implement the board component
- [ ] 3.5 Write failing tests for DnD (optimistic + rollback on 409, keyboard move for 2.5.7); then implement dnd-kit integration with pointer + keyboard sensors
- [ ] 3.6 Write failing tests for task CRUD (insert line + UUID, delete tombstone cross-session, edit region-scoped, per-section If-Match 409, NFR-10 audit emission on every mutation); then implement CRUD endpoints
- [ ] 3.7 Write failing tests for import/export (diff preview, byte-identical CLI-acceptable export); then implement import/export
- [ ] 3.8 Write failing tests for real-time updates + 3-way merge (≤2s propagation, 409 on same-section, different-section success, diff-match-patch merge); then implement the merge UI + realtime channel
- [ ] 3.9 Manual AT pass: NVDA/VoiceOver/JAWS + keyboard-interaction scripts for the Kanban DnD; record results as phase-exit evidence (NFR-9 / 2.5.7)
- [ ] 3.10 Integration test: full Markdown→sidecar→board→CRUD→merge round-trip against testcontainer DB; assert line coverage ON

## 4. Schema module — read + validate + resolution debug (req 05 §5.1, 5.2, 5.7, 5.9)

- [ ] 4.1 Write failing tests for three-layer listing (precedence, active badge); then implement the list route + page
- [ ] 4.2 Write failing tests for schema detail (DAG style parity, template preview); then implement the detail route + page
- [ ] 4.3 Write failing tests for schema validation (circular deps, missing template, apply.tracks refs); then implement the read-only validator (no apply-fix, no file creation — Phase 1 validation is report-only)
- [ ] 4.4 Write failing tests for resolution debug (path hit/miss, wrong-layer diagnostic); then implement the debug view
- [ ] 4.5 Write a contract test asserting NO schema mutation endpoint exists (405 on POST) — enforces the read-only boundary and the no-dead-code rule

## 5. Dashboard overview + timeline + velocity (req 07 §7.1, 7.3, 7.5)

- [ ] 5.1 Write failing tests for single-project overview (counts reconcile, tile click-through); then implement the overview page
- [ ] 5.2 Write failing tests for activity timeline (audit-log-sourced, deep-links, filters); then implement the timeline component + endpoint
- [ ] 5.3 Write failing tests for velocity chart (audit completions, configurable window); then implement the chart + endpoint
- [ ] 5.4 Integration test: overview + timeline + velocity render against a testcontainer DB seeded with audit events

## 6. NFR measurement plumbing (§1.6)

- [ ] 6.1 Write failing tests for the Lighthouse CI gate threshold logic (NFR-1 cold/warm); then wire the Lighthouse CI workflow
- [ ] 6.2 Write failing tests for the k6 read-latency thresholds (NFR-2 p50/p99, cache path); then add the k6 script + CI job
- [ ] 6.3 Write failing tests for the index-freshness probe (NFR-6 ≤2s); then add the probe
- [ ] 6.4 Write failing tests for axe-core per-component (NFR-9 incl. 2.2 SC); then wire axe into the component test suite
- [ ] 6.5 Confirm the DnD manual AT results from task 3.9 are referenced by the NFR-9 evidence; ensure no deferral

## 7. Verification

- [ ] 7.1 `npm run typecheck` and `npm run lint` pass with no new errors
- [ ] 7.2 `npm run test:coverage` (unit) and `npm run test:integration:coverage` pass the `testing-standard` gates (referenced, not restated); line coverage instrumentation verified ON during integration
- [ ] 7.3 `npm run knip` reports no dead code introduced by this change
- [ ] 7.4 `npm run build` succeeds with `DATABASE_URL` set
- [ ] 7.5 Cross-check: every Phase 1 req (02 §2.1–2.5/2.7/2.8, 03 §3.1–3.10/3.13, 04 §4.1–4.6/4.11/4.21/4.22/4.24, 05 §5.1/5.2/5.7/5.9, 06 §6.4a, 07 §7.1/7.3/7.5) maps to a spec + task; no orphans, no Phase 2 sneak-ins
- [ ] 7.6 Verifier-loop: 2 fresh blind verifiers approve before milestone 1
