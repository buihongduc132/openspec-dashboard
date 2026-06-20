## 1. Testing harness (cite `testing-standard` — do not re-create it)

- [ ] 1.1 Confirm the `testing-standard` capability (change `tdd-coverage-standard`) has landed Vitest + coverage + knip; if it has NOT landed yet, block on it (Phase 0 is the first consumer) and surface the blocker to the coordinator
- [ ] 1.2 All tasks below are TDD-first: write the failing test (red) → implement (green) → refactor. Each task's test is committed alongside its implementation in the same step

## 2. §0.1 Upstream-format empirical gates (req 08 §8.9)

- [ ] 2.1 Write a finding scaffold: `flow/findings/2026-06-20_openspec-upstream-gates.md` with one section per gate (sidecar coexistence, workspace format, context-store format, schema-fork provenance, parser source retrieval)
- [ ] 2.2 Gate 1 — build a fixture OpenSpec repo with files under `openspec/.dashboard/`, run `openspec validate`, assert zero findings traverse the sidecar dir; write the binary outcome to the finding; if it fails, flip the `SIDECAR_LOCATION` constant to `.openspec-dashboard/` (D0-5) and re-run
- [ ] 2.3 Gate 2/3 — clone the upstream OpenSpec repo, read source for workspace/context-store/schema-fork formats; record actual formats in the finding; if unobtainable, mark the feature as "server-side projection only" (deferred to Phase 3a)
- [ ] 2.4 Gate 4 — attempt `npm install openspec` and/or clone + de-bundle to retrieve the parser source; record what was obtainable; populate the initial NFR-5 gap registry from the result

## 3. §0.2 OpenSpec parser port (TDD)

- [ ] 3.1 Write failing corpus tests: parse→serialize→parse byte-fidelity over a fixture corpus (`tests/fixtures/openspec/*`); property-based tests for untouched regions (NFR-4) — RED
- [ ] 3.2 Implement `src/lib/openspec-parser/spec.ts` (Spec/Requirement/Scenario/RFC 2119 grammar) — GREEN
- [ ] 3.3 Implement `src/lib/openspec-parser/delta.ts` (ADDED/MODIFIED/REMOVED/RENAMED, including REMOVED Reason+Migration validation) with failing-then-passing tests for each verb
- [ ] 3.4 Implement `src/lib/openspec-parser/tasks.ts` (checkbox parser preserving verbatim markers `- [ ]`/`- [x]`/`- [X]` as INV-2 demands) with marker-preservation tests
- [ ] 3.5 Write the documented-rule enumeration (`src/lib/openspec-parser/rules.ts`) and the gap registry (`src/lib/openspec-parser/gap-registry.ts`); test that an unknown construct is appended to the registry and parsing continues (not crashes)
- [ ] 3.6 Confirm corpus + property tests pass GREEN; commit the corpus under `tests/fixtures/`

## 4. §0.3 Filesystem projection + atomic writes + ETag (TDD)

- [ ] 4.1 Write failing test for path-allowlist registration (allowlisted path accepted; `/etc` rejected; `../../etc` traversal rejected) — RED
- [ ] 4.2 Implement `src/lib/projection/register.ts` (local path + allowlist, no remote clone in Phase 0) — GREEN
- [ ] 4.3 Write failing test for chokidar watcher: out-of-band edit reconciled <2s; bulk `git checkout` debounced + survives; self-write suppressed — RED
- [ ] 4.4 Implement `src/lib/projection/watcher.ts` (chokidar + debounce + self-write marker set) — GREEN
- [ ] 4.5 Write failing test for atomic write (temp+rename; reader never sees half-write; rename-failure rolls back projection + returns 5xx) — RED
- [ ] 4.6 Implement `src/lib/projection/atomic-write.ts` — GREEN
- [ ] 4.7 Write failing ETag middleware tests: different-section both succeed; same-section second commit 409; missing If-Match → 428; POST create exempt — RED
- [ ] 4.8 Implement `src/app/api/middleware/etag.ts` (`withEtag(handler, sectionResolver)`) + per-route resolvers per the Section Granularity Table — GREEN
- [ ] 4.9 Write failing ETag-persistence tests (D0-9): restart preserves a client-issued ETag (no spurious 409); missing `etags.json` on startup re-derives from disk + resets version to genesis; version-file write is atomic (temp+rename) — RED
- [ ] 4.10 Implement `src/lib/projection/etag-store.ts` (per-project sidecar `etags.json`, atomic bumps, reload-on-startup before any mutating endpoint is served) — GREEN
- [ ] 4.11 Confirm `SIDECAR_LOCATION` constant flows through every sidecar path reference (D0-5); test that flipping it relocates all sidecar paths atomically (incl. `etags.json`)

## 5. §0.4 Audit log + hash-chain verifier (TDD)

- [ ] 5.1 Write failing test for hash chain: first entry chains to genesis; subsequent chains to previous; same-body different-timestamp entries hash distinctly — RED
- [ ] 5.2 Implement `src/lib/audit/chain.ts` (entryBody schema, SHA-256 chaining, canonical serialization) — GREEN
- [ ] 5.3 Write failing test for per-project mutex: concurrent appends serialize; restart re-reads last hash as head — RED
- [ ] 5.4 Implement `src/lib/audit/append-queue.ts` (per-project async mutex) — GREEN
- [ ] 5.5 Write failing test for chain verifier: tampered entry detected; deleted entry detected; clean chain passes — RED
- [ ] 5.6 Implement `src/lib/audit/verifier.ts` + a scheduled job (cron-equivalent) — GREEN
- [ ] 5.7 Write failing test for quarantine: on chain break, mutations return 503, reads stay 200 — RED
- [ ] 5.8 Implement quarantine state + middleware gating — GREEN
- [ ] 5.9 Write failing tests for audit-file edge cases: file missing on startup (re-init from genesis); partial-write temp file detected + deleted on restart (chain resumes from last full entry); unreadable file (permission/IO error) → immediate quarantine + operator incident — RED
- [ ] 5.10 Implement startup recovery for missing/partial/unreadable audit files in `src/lib/audit/recovery.ts` — GREEN
- [ ] 5.11 Write failing NFR-10 contract test against the stub route; then add the stub `POST /api/__stub/mutate` route through ETag + audit emission to make it pass (D0-7) — GREEN; track stub removal for Phase 1
- [ ] 5.12 Write failing test for retention archive-then-delete + per-project erasure leaving sibling chains untouched — RED; implement `src/lib/audit/retention.ts` — GREEN
- [ ] 5.13 Write failing test for the existing-`audit_logs`-table reconciliation (D0-8): emission middleware writes BOTH the filesystem chain entry AND a best-effort `audit_logs` row with matching fields; filesystem chain wins on conflict; existing `audit_logs` rows backfilled into the filesystem chain in `createdAt` order from genesis with no history lost — RED
- [ ] 5.14 Implement `src/lib/audit/postgres-mirror.ts` (dual-write) + the one-time cutover backfill migration `src/db/migrations/backfill-audit-chain.ts` — GREEN

## 6. §0.5 OpenAPI skeleton + health + read endpoints (TDD)

- [ ] 6.1 Write failing test for `GET /health` (200 + parserVersion; degraded indicator on watcher death) — RED; implement `src/app/api/health/route.ts` — GREEN
- [ ] 6.2 Write failing tests for `GET /projects`, `GET /projects/:id/specs`, `GET /projects/:id/changes` (list works; unknown project 404; reads reflect out-of-band edits) — RED
- [ ] 6.3 Implement the three read routes reading from the in-memory projection — GREEN
- [ ] 6.4 Wire OpenAPI 3.1 generation; write a failing test that the generated document validates against the OpenAPI 3.1 schema and includes every route — RED; implement generation — GREEN

## 7. §0.6 Secret hygiene (completes partial state)

- [ ] 7.1 Extend `.gitignore` to pre-ignore BOTH sidecar paths (`openspec/.dashboard/` and `.openspec-dashboard/`) plus `.env*`, `*.key`, `*.pem`, `secrets/`, `auth.json`, `config.local.yaml`, DB files; test that `git status` ignores a planted file in each
- [ ] 7.2 Add `.gitleaks.toml`; wire pre-commit + pre-push hooks (lefthook or husky); write a test that a deliberately staged fake secret is caught by each hook
- [ ] 7.3 Add the CI gitleaks job as a required PR check (history + working tree)
- [ ] 7.4 One-time history scan of already-pushed refs (`e8a516f`, `39cb79b`, all refs); write the binary outcome to `flow/findings/`; if dirty, block Phase 0 and execute the rewrite + force-update + rotate path

## 8. §0.7 Threat model v1 (NFR-11)

- [ ] 8.1 Draft `docs/threat-model/v1.md` covering: registration (path traversal, clone RCE — forward-looking), agent write API (forward-looking), inbound webhook (forward-looking), outbound webhook SSRF (forward-looking), multi-tenant isolation, public-repo publication
- [ ] 8.2 For Phase-0-in-code surfaces (registration allowlist, atomic writes, audit chain), cite the concrete spec requirement + task as the mitigation; mark forward-looking surfaces explicitly so they are not mistaken for mitigated

## 9. §0.8 Verifier-loop milestone 0

- [ ] 9.1 Run `openspec status --change phase0-foundations`; confirm 4/4 artifacts done
- [ ] 9.2 Run the `testing-standard` coverage gates on Phase 0 code; confirm the thresholds defined by `testing-standard` (NFR-12) are met for the Phase 0 slice and that knip reports no dead code
- [ ] 9.3 Verifier-loop: 2 fresh BLIND verifiers review the change (proposal + specs + design + tasks) against req 08 §8.1/8.2/8.3/8.7/8.9/8.10, req 09 §9.6/9.8/9.9, INV-1/2/6/7/9, NFR-3/4/5/10/11; reject on any uncovered edge case, overengineering, or missing requirement; fix + re-verify until unanimous APPROVE
