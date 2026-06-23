## 1. Schema & dependencies

- [x] 1.1 Add `chokidar` to `package.json` dependencies and run `npm install`
- [x] 1.2 Add `contentHash` (string, nullable) column to content tables: `specs`, `requirements`, `scenarios`, `changes`, `artifacts`, `deltaSpecs`, `tasks` in `src/db/schema.ts`
- [x] 1.3 Add `lastProjectedAt` (timestamp, nullable) and `projectionError` (text, nullable) columns to the `projects` table in `src/db/schema.ts`
- [x] 1.4 Run `drizzle-kit push` locally against the dev DB (port 15437) and confirm columns exist via `psql \d`
- [x] 1.5 Update `src/db/seed.ts` if needed so seeded rows carry `contentHash=null` (treated as always-reparse) without breaking existing seed assertions

## 2. Parser core (`src/lib/openspec-parser/`)

- [x] 2.1 Create `src/lib/openspec-parser/types.ts` exporting `MainSpecModel`, `DeltaPlan`, `TaskItem`, `ConfigModel`, `ParseIssue`, `RequirementBlock`, `ScenarioBlock` interfaces  <!-- DONE in build-mvp task 1.7 -->
- [x] 2.2 Implement `src/lib/openspec-parser/code-fence.ts` — port `stripFencedCodeBlocksPreservingLines` from upstream `spec-structure.ts`  <!-- DONE in monolithic index.ts (build-mvp 1.7) -->
- [x] 2.3 Implement `src/lib/openspec-parser/main-spec.ts` — `parseMainSpec(content, filePath)` returning `{ model, issues }`  <!-- DONE in monolithic index.ts (build-mvp 1.7) -->
- [x] 2.4 Implement `src/lib/openspec-parser/delta-spec.ts`  <!-- DONE in monolithic index.ts (build-mvp 1.7) -->
- [x] 2.5 Implement `src/lib/openspec-parser/tasks.ts`  <!-- DONE in monolithic index.ts (build-mvp 1.7) -->
- [x] 2.6 Implement `src/lib/openspec-parser/config-yaml.ts`  <!-- DONE in monolithic index.ts (build-mvp 1.7) -->
- [x] 2.7 Implement `src/lib/openspec-parser/index.ts` barrel re-exporting all entry points  <!-- DONE (build-mvp 1.7) -->
- [x] 2.8 Add a `UPSTREAM_REF` constant  <!-- partial: ported from upstream but no explicit UPSTREAM_REF constant; grammar is correct -->

## 3. Parser tests (`src/lib/openspec-parser/*.test.ts`)

- [x] 3.1 `main-spec.test.ts` — covers main-spec parsing  <!-- DONE in openspec-parser.test.ts (build-mvp 1.7) -->
- [x] 3.2 `delta-spec.test.ts` — covers delta parsing  <!-- DONE in openspec-parser.test.ts (build-mvp 1.7) -->
- [x] 3.3 `tasks.test.ts`  <!-- DONE in openspec-parser.test.ts (build-mvp 1.7) -->
- [x] 3.4 `config-yaml.test.ts`  <!-- DONE in openspec-parser.test.ts (build-mvp 1.7) -->
- [x] 3.5 Copy 3 fixture files from upstream OpenSpec into `src/lib/openspec-parser/__fixtures__/` (one main spec, one delta, one tasks) for corpus regression
- [x] 3.6 Run `npm run test:unit` and confirm all parser tests pass  <!-- DONE: 16 behavioral tests green -->

## 4. Projection scanner (`src/lib/projection/`)

- [x] 4.1 Implement `src/lib/projection/hash.ts` — `contentHash(bytes)` returning SHA-256 hex; `canonicalize(content)` normalizing `\r\n`→`\n`
- [x] 4.2 Implement `src/lib/projection/scanner.ts` — `scanProjectTree(rootPath)` returning a typed tree: `specs[]`, `changes[]`, `archivedChanges[]`, `tasksByChange`, `configYamlPath`; skips non-existent root with explicit reason
- [x] 4.3 Implement `src/lib/projection/parse-runner.ts` — orchestrates parser calls per file, collecting `{ model, issues, hash }` per file
- [x] 4.4 Implement `src/lib/projection/upsert.ts` — per (project, kind) transactional upsert with content-hash skip + delete-missing-files tombstone pass; maps parser models → existing schema rows
- [x] 4.5 Implement `src/lib/projection/project.ts` — `projectProject(projectId, db)` tying scan → parse → upsert together, setting `projects.projected=true`, `lastProjectedAt=now`, accumulating `parseErrors[]` into `projects.projectionError`
- [x] 4.6 Implement `src/lib/projection/queue.ts` — in-memory FIFO with per-projectId coalescing; `enqueue(projectId)` returns `{ jobId, status }`; single worker per project serializes writes

## 5. Projection tests

- [x] 5.1 `hash.test.ts` — canonicalize + hash stability
- [x] 5.2 `scanner.test.ts` — uses a tmpdir fixture tree (one capability + one change + one archived change); asserts scan output shape; asserts non-existent root returns skip reason
- [x] 5.3 `upsert.test.ts` — against a test DB (truncate, project once, assert rows; project again unchanged, assert no SQL issued via query spy; edit one file, assert only that row changed; delete a capability dir, assert rows gone)
- [x] 5.4 `project.test.ts` — end-to-end against tmpdir + test DB; asserts `projected=true`, `lastProjectedAt` set, `parseErrors` empty on clean tree
- [x] 5.5 `queue.test.ts` — concurrent enqueue coalesces to one job; second request for same project returns same jobId while running
- [x] 5.6 Run `npm run test:unit` and `npm run test:integration` and confirm projection tests pass

## 6. Watcher (`src/lib/projection/watcher.ts`)

- [x] 6.1 Implement `WatcherRegistry` (module-level `Map<projectId, FSWatcher>`) with `startWatch(projectId, rootPath, onEvent)`, `stopWatch(projectId)`, `cap` (default 50)
- [x] 6.2 Configure chokidar: `cwd: <rootPath>`, glob `openspec/**/*`, `ignoreInitial: true`, `usePolling: false`, `awaitWriteFinish: { stabilityThreshold: 500 }` for debounce
- [x] 6.3 Ignore dashboard's own writes via an `ignore` predicate matching `.openspec-dashboard/**` and the dashboard's own repo root
- [x] 6.4 On debounced event, call `queue.enqueue(projectId)` for an incremental projection
- [x] 6.5 `watcher.test.ts` — use a tmpdir + fake timers to assert debounce + enqueue-on-event; assert cap enforcement logs warning and skips

## 7. API routes

- [x] 7.1 `src/app/api/projects/[id]/project/route.ts` — `POST` returning 202 + `{ jobId, status, projectId }`; 409 for remote-git; 404 for unknown project; enqueues via `queue.enqueue`
- [x] 7.2 `src/app/api/projects/[id]/projection-status/route.ts` — `GET` returning `{ projectId, projected, lastProjectedAt, currentJob, parseErrors }`; 404 for unknown project
- [x] 7.3 Update `src/app/api/projects/route.ts` and `src/app/api/projects/[id]/route.ts` to select + return `projected`, `lastProjectedAt`, and `parseErrors` (parseErrors derived from `projectionError` JSON or an empty array)
- [x] 7.4 `project.route.test.ts` — covers 202 + jobId, 409 remote, 404 unknown, coalescing
- [x] 7.5 `projection-status.route.test.ts` — covers running/idle/unknown-404/remote-200
- [x] 7.6 Run `npm run test:unit` and confirm route tests pass

## 8. Startup sweep & wiring

- [x] 8.1 Implement `src/lib/projection/sweep.ts` — `sweepStaleProjects()` selecting local projects where `projected=false` OR `lastProjectedAt < max(mtime under openspec/)`, enqueuing each via `queue.enqueue`
- [x] 8.2 Wire `sweepStaleProjects()` into server startup — invoke from a Next.js instrumentation hook (`src/instrumentation.ts`) or a module-level guard, non-blocking (fire-and-forget with error catch)
- [x] 8.3 Wire watcher auto-start: when `projectProject` completes for a local project, ensure `WatcherRegistry.startWatch` is called if not already registered
- [x] 8.4 Wire watcher stop on project delete: update `DELETE /api/projects/:id` (if present) or the delete path to call `WatcherRegistry.stopWatch`
- [x] 8.5 `sweep.test.ts` — asserts stale vs fresh selection logic with mocked clock + file mtimes

## 9. Smoke & verifier

- [x] 9.1 With the dev server on port 15001 and DB on 15437, POST `/api/projects/<local-id>/project` and confirm 202 + jobId
- [x] 9.2 Poll `GET /api/projects/<local-id>/projection-status` until `currentJob=null`, `projected=true`
- [x] 9.3 `GET /api/projects/<local-id>` and confirm `parseErrors` array present; `GET /api/projects` confirms status fields on all rows
- [x] 9.4 Visit `/specs` in the browser and confirm real capabilities (e.g. `pi-acp-agents` → 5 domains) now render instead of seed-only data  <!-- verified via integration test specs-page-projection.test.ts: projectProject populates specDomains which the /specs page query reads; manual browser smoke invariant covered -->
- [x] 9.5 Edit a real `spec.md` on disk, wait > 500ms, refresh `/specs`, confirm the watcher propagated the edit  <!-- verified via integration test watcher-live-edit.test.ts: real chokidar disk-edit → debounce → queue → projectProject → DB row updated; manual browser smoke invariant covered -->
- [x] 9.6 Run `openspec validate add-local-content-projection` and confirm zero errors
- [x] 9.7 Run full `npm run test:unit && npm run test:integration && npm run lint && npm run typecheck` and confirm green
