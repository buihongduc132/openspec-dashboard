# Requirements 06 — Verification & Quality

> **Parity clarification (D-Verify):** upstream `/opsx:verify` is an AI-driven slash command.
> We CANNOT claim parity with deterministic heuristics. This module is therefore
> "**/opsx:verify-inspired heuristic checks**" with an OPTIONAL LLM-augmented tier in
> Phase 3. INV-6 applies.

## 6.1 Heuristic verification (inspired by `/opsx:verify`)

**Shall:** Run a **heuristic** verification pass on a change covering three dimensions:

- **Completeness** — all tasks in `tasks.md` checked; every requirement in the delta spec
  has at least one implementing task; every ADDED requirement has scenarios.
- **Correctness (heuristic)** — keyword overlap between task prose and requirement intent;
  scenario-step coverage (Given/When/Then verbs echoed in tasks). Documented as a
  best-effort heuristic, NOT AI-grade correctness.
- **Coherence (heuristic)** — design.md decisions are reflected in delta specs and tasks
  (keyword overlap); design decisions without implementing tasks flagged.

**AC:**
- (a) Output: findings list with severity CRITICAL / WARNING / SUGGESTION, each linked to
  the offending artifact + line.
- (b) "Re-run after fix" reruns only the failing checks for speed.
- (c) Verification is non-blocking (advisory) unless `config.yaml` sets `verify.required:
  true` for the project.
- (d) **Optional LLM tier (Phase 3)**: a pluggable verifier backend calls a configured LLM
  for true `/opsx:verify`-grade reasoning. Enabled per-project; cost/latency surfaced.

## 6.2 Spec validation (project-wide)

**Shall:** Run `openspec validate`-equivalent at project scope: every spec file, every
delta spec in every change. Aggregated report grouped by file.

**AC:**
- (a) Same finding model as `02-specs.md` §2.5 but aggregated.
- (b) Filterable by severity, file, rule id.

## 6.3 Validation dashboard

**Shall:** Aggregated view across all changes + specs: counts by severity, top offending
files, trend over time (findings opened vs resolved).

**AC:**
- (a) Trend fed by the audit log (validation runs + resolutions) — available once the audit
  log ships (Phase 0).
- (b) Drill-down from dashboard tile to the finding list scoped to that severity/file.

## 6.4 Conflict detection (full matrix — split into 6.4a requirement-level + 6.4b file-level)

**6.4a Requirement-level conflict detection (owned: Phase 1.1).** Detect every pairwise
conflict between **active** changes touching the same spec domain at the requirement level.
The FULL requirement-level matrix:

| Change A verb | Change B verb | Conflict? | Resolution |
|---------------|---------------|-----------|------------|
| ADDED `R`     | ADDED `R`     | YES       | Rename one or merge content |
| ADDED `R`     | MODIFIED `R`  | YES (A's add has nothing to modify — B is stale) | B re-pinned to A's version, or split |
| ADDED `R`     | REMOVED `R`   | YES       | Resolve before either archives |
| ADDED `R`     | RENAMED `R`→`R'` | YES    | Reconcile names |
| MODIFIED `R`  | MODIFIED `R`  | YES       | Archive order + 3-way merge |
| MODIFIED `R`  | REMOVED `R`   | YES       | Decide fate of `R` |
| MODIFIED `R`  | RENAMED `R`→`R'` | YES    | Reconcile |
| REMOVED `R`   | REMOVED `R`   | NO (idempotent) | None |
| REMOVED `R`   | RENAMED `R`→`R'` | YES    | Reconcile |
| RENAMED `R`→`R'` | RENAMED `R`→`R''` | YES | Reconcile target names |
| any           | references `R` (orphan) | YES | Resolve orphan reference |

**Plus archived→active drift (M-6):** after a change archives, any active change whose
delta touches a requirement the archive just modified/removed is **stale** — its expected
base is wrong. The drift detector runs on every archive and surfaces stale active changes
for rebase. (This is the canonical handling; req 03 §3.14(b) file-level conflicts are the
6.4b superset.)

**6.4b File-level conflict detection (owned: Phase 2.2).** At archive time, detect
concurrent edits to the same `specs/<domain>.md` across the selected set by comparing the
pre-archive main-spec content hash vs each change's expected base hash. Mismatches trigger
the resolution UI.

**AC (6.4a + 6.4b):**
- (a) Conflict surface is real-time (recomputed on any change edit). Requirement-level
  (6.4a) ships in Phase 1.1; file-level (6.4b) ships in Phase 2.2 — Phase 1 explicitly does
  NOT claim file-level coverage. **The matrix rows in 6.4a are matched by requirement UUID
  (D-ReqID) where the UUID exists; requirements that have not yet been assigned a UUID
  (e.g., a brand-new ADDED requirement not yet in `req-ids.json`) are matched by name as a
  fallback**, with the UUID assigned and recorded at first-seen.
- (b) Conflict-resolution UI offers: archive order suggestion, side-by-side merge editor,
  or "split the requirement" (creates two distinct requirements).
- (c) All conflicts must be resolved before any of the conflicting changes can archive.

## 6.5 Cross-repo consistency (workspace scope — owned: Phase 3)

**Shall:** When a workspace links multiple repos, detect conflicts where two repos' active
changes touch semantically equivalent requirements. **Matching key = (workspace-scoped
project alias + normalized requirement signature)**, where the normalized signature is
`(domain, lowercased-kebab-name, scenario-heading-hashes, RFC-2119-strength-set)`. Exact-match only;
near-matches are surfaced as "review candidates" with a confidence label, never
auto-merged.

**AC:**
- (a) Matching is conservative (exact-signature); false-positive rate published on a
  fixture corpus as a Phase 3 gate.
- (b) Cross-repo conflict view sortable by repo pair; manual "dismiss false-positive"
  recorded in audit log.
