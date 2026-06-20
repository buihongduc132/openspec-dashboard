## Context

Phases 0–3 ship a functional dashboard: parser/projection/audit/ETag (0), per-project modules + kanban (1), richness (2), auth/RBAC (3a), integration/git/webhooks (3b). Phase 4 is the analytics + polish + open-source-release layer. All analytics are read-only views over data that already exists (audit log, changes, tasks, specs, requirements, archive dir). The audit log and ETag infrastructure are already in place from Phase 0, so analytics have a stable data source.

Two scoping facts shape this design: (1) velocity (req 7.5) and project overview (7.1) / activity timeline (7.3) already shipped in Phase 1.5 — Phase 4 must not re-spec them; (2) the repo is already public, so the "publication gate" governs subsequent sensitive releases, not a re-do of the initial push.

## Goals / Non-Goals

**Goals:**
- Org-level analytics that are computed by a shared metric module so per-project and org numbers never drift.
- Versioned export/backup with version-checked restore.
- A release-ready repo: docs, demo, contribution guide, two-person secret-scanned publication gate, UI modernization that enforces NFR-1/2/9.
- Every Phase 4 code path developed test-first per the `testing-standard` capability.

**Non-Goals:**
- Re-specifying velocity (7.5), project overview (7.1), activity timeline (7.3) — already in Phase 1.5.
- Performance-review or gamification features for contributors (explicit req 7.7 non-goal).
- A new charting/data-viz framework beyond what is justified; prefer lightweight rendering.
- Re-doing the initial public push or re-litigating the Phase 0.6 retroactive history scan.
- Real-time streaming analytics; analytics are cache-backed snapshots within the refresh window.

## Decisions

### D1: Shared `lib/metrics/` module as the single metric source
**Decision:** All metric computation (active changes, task completion %, validation status, last activity, archive frequency, contributor counts) lives in one server-side module `src/lib/metrics/`. Both the per-project card (req 1.6/7.1) and the org rollup (7.2) call the same functions; the rollup is a map+reduce over the per-project results.

**Why:** The spec mandates that per-project and org numbers never diverge. A shared module makes that an architectural invariant, not a hope. Per-page queries would drift.

**Alternatives:** Per-route inline queries (rejected — drift), a materialized view in Postgres (premature; the audit log is the source and refreshes are windowed).

### D2: Analytics are cached, not live-computed, with a stale-on-timeout policy
**Decision:** Each analytics surface computes on a refresh window (default 60s, configurable) backed by an in-memory + optional Redis cache, reusing the Phase 1.5 impact-analysis cache pattern. If a query exceeds its time budget, return the last good cached value with a visible "stale" indicator.

**Why:** Aggregations over audit_logs + changes are O(n); live computation on every page load risks NFR-2 regression. The stale-on-timeout policy keeps the page rendering (spec requirement) instead of erroring.

**Alternatives:** Live every load (NFR-2 risk), or precompute via a cron worker (overkill at this scale; revisit if the audit log grows large).

### D3: Contributor anonymity implemented server-side
**Decision:** When anonymity mode is on, the server maps real `author` values to per-author stable pseudonyms before serialization. The pseudonym is computed as `"Contributor-" + first 4 hex chars of SHA-256(rawAuthorId)` — a label derived from the author identifier alone, NOT from rank position, so the label for a given author never changes regardless of how the contributor set or sort order changes. The raw identifiers never reach the client. Counts are computed on real authors; only the label is masked.

**Why:** Client-side masking leaks identifiers in the response payload. Server-side masking is the only way to honor the spec's privacy intent. Rank-ordered labels ("Contributor A/B/C") are NOT stable when the contributor set changes — a new higher-ranked contributor shifts everyone's label — so per-author hash-derived labels are required for the stability the spec demands.

**Alternatives:** Client-side masking (rejected — leaks), hashing-only display without human-readable suffix (rejected — not human-readable), rank-ordered A/B/C labels (rejected — unstable across contributor-set changes).

### D3a: Validation-error introduced-vs-resolved correlation by stable tuple
**Decision:** The contributor analytics correlate an "introduced" validation error to its later "resolved" event by the tuple `(projectId, specDomain, requirementUUID, failingRuleId)`, where the requirement UUID is the D-ReqID stable identity (NOT the requirement name). Resolution is attributed to the author whose change produced the passing run. Correlation spans an unbounded window across runs within the same project; a resolved-then-re-introduced tuple counts as 2 introduced / 1 resolved.

**Why:** Using the requirement name as the key would break correlation when a requirement is renamed mid-history (D-ReqID guarantees UUID continuity across renames, names do not). Using a coarser key (domain-only, or rule-only) would mis-attribute: two different rules failing on the same requirement, or the same rule on two different requirements, would be indistinguishable. The tuple is the smallest stable identity that uniquely identifies a single failing check.

**Alternatives:** Requirement-name key (rejected — breaks on rename, violates D-ReqID), domain-only key (rejected — over-counts resolutions), a server-assigned error GUID stored at introduction time (rejected — requires a new persistent error table for analytics-only state; the tuple is derivable from existing audit/ validation records without new storage).

### D4: Export as a streaming tarball with a manifest, restore as version-gated
**Decision:** Export streams a tarball (`tar-stream` or Node `tar`) containing the canonical `openspec/` tree + dashboard metadata dir + audit log + a `manifest.json`. The manifest records: server version, schema versions, sidecar versions, content hashes, AND the resolved dashboard-metadata path (D-SidecarLoc: `openspec/.dashboard/` OR `<repo>/.openspec-dashboard/`) that was exported. Restore reads the manifest FIRST, validates version compatibility, refuses on mismatch, and only then applies — into a fresh registration by default, requiring explicit overwrite confirmation for a non-empty target. Restore writes imported metadata to the target deployment's currently resolved sidecar path (not the manifest's source path); the source path is informational and a path mismatch does not block restore. Restore acquires per-section ETag locks (INV-7) at section granularity, streaming sections one at a time — never a whole-project transactional lock — so a conflict on one section does not roll back already-applied sections; succeeded and rejected sections are both reported.

**Why:** The spec requires version validation before any state mutation, and per-section atomicity (no partial-section corruption) with section-level conflict reporting (not all-or-nothing across hundreds of sections). Reading the manifest first is the only way to fail fast on version mismatch. Per-section streaming locks avoid the deadlock/liveness risk of locking hundreds of sections at once and match INV-7's section granularity. Recording the resolved sidecar path is necessary so restore knows where metadata came from and can remap onto a target that resolved a different path.

**Alternatives:** Zip (no streaming advantage on server), a single JSON dump (loses filesystem fidelity required by INV-1), restore-then-validate (rejected — violates "validate before applying"), whole-project transactional restore lock (rejected — deadlock risk + blocks all concurrent editors for the whole restore), file-granularity locks (rejected — coarser than INV-7 allows, causes false conflicts between sections in the same file).

### D5: Heatmap cells and leaderboard entries deep-link via existing routes
**Decision:** Every interactive analytics element (heatmap day cell, coverage domain row, slowest-change entry) deep-links to an existing Phase 1 route (filtered activity feed, domain spec view, archived change detail). No new detail routes are created just for analytics drill-down.

**Why:** Avoids route duplication and keeps analytics as a read surface. Existing routes already accept query params for filtering (Phase 1).

**Alternatives:** Dedicated analytics detail routes (rejected — duplication).

### D6: UI modernization is presentation-only, gated by NFR CI jobs
**Decision:** The modernization pass touches styling, spacing, design tokens, and component consolidation across Phase 1–3 components, but makes no behavioral changes. The Phase 1–3 acceptance test suites are the regression gate: they must pass unchanged. NFR-1 (Lighthouse CI), NFR-2 (k6), NFR-9 (axe + manual AT) are enforced CI jobs that block the release.

**Why:** Behavioral changes would require re-spec; presentation changes are safe to gate via the existing test suites + NFR jobs. This keeps the modernization honest.

**Alternatives:** Allow behavioral tweaks (rejected — scope creep), NFR jobs as advisory (rejected — must enforce).

### D7: Publication gate is a documented process + CI secret scan, not bespoke code
**Decision:** The two-person gate is a documented checklist in the contribution guide + a CI job that runs gitleaks over all refs and the working tree and fails on any finding. No custom "publication" service is built.

**Why:** The gate's value is the human review + the secret scan; both are process/tooling, not application code. Building a bespoke publication service would be gold-plating.

**Alternatives:** A publication orchestration service (rejected — overengineered), manual-only with no CI scan (rejected — the scan must be enforced).

### D8: Testing standard cited, not restated; explicit tooling prerequisite
**Decision:** The design references the `testing-standard` capability (from `tdd-coverage-standard`) for TDD discipline, the coverage gates, and the dead-code prohibition; the exact thresholds are owned by that capability and are not restated here. Phase 4's `tasks.md` includes a test-writing step per implementation task. The Phase 4 verifier-loop milestone checks coverage + dead code for Phase 4 code. The `tdd-coverage-standard` change is an explicit prerequisite: Phase 4 verification tasks (10.2/10.3) invoke `npm run test:coverage`, `test:integration:coverage`, `knip` — scripts that change provisions — so Phase 4 verification is not runnable until `tdd-coverage-standard` lands. This is declared identically to `phase0-foundations` task 1.1.

**Why:** Single source of truth (INV-9 / D-TDD / NFR-12). Restating thresholds per change is the duplication the standard forbids. Declaring the tooling prerequisite up front prevents a verifier from flagging "undefined scripts" as a defect.

**Alternatives:** Restate thresholds (rejected — violates the standard's own "cite, don't duplicate" requirement), omit the prerequisite declaration (rejected — leaves the tooling dependency implicit and fails a verifier check).

## Risks / Trade-offs

- **[Aggregation query cost]** Analytics over a large audit log are expensive. → Cached snapshots (D2) bound cost; if the audit log grows past a threshold, a materialized view becomes justified (deferred, not Phase 4).
- **[Stale data confused for live]** Users may act on stale analytics. → Every analytics surface shows a "last computed at" timestamp and a stale indicator on timeout (D2); no surface claims to be real-time.
- **[Anonymity pseudonym collision]** Two distinct authors mapping to the same pseudonym. → Deterministic hash into a large label space; collision probability is negligible and a collision would be visible (two rows merge), caught in testing.
- **[Export tarball size]** Large projects produce large tarballs. → Streaming (D4) avoids memory pressure; a size guard warns above a threshold but does not block.
- **[Restore overwrites conflicting newer state]** Restoring an old tarball over a project that moved on. → Restore requires explicit overwrite confirmation for non-empty targets (spec) and produces new ETags + audit entries; INV-4a archive-sequence semantics still hold for any archive state in the tarball.
- **[Modernization hides an a11y regression]** A styling change could break a screen-reader path. → NFR-9 CI (axe + manual AT scripts) blocks the release; the manual AT pass is re-run for the modernized surfaces, not skipped.
- **[Secret in a ref the scan misses]** gitleaks might not scan a force-pushed orphan ref. → Gate scans `--all-refs` and the working tree; contribution guide documents rewriting history on a finding, which removes the ref.
