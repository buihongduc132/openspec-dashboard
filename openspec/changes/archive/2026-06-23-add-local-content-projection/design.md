## Context

The dashboard currently reads every artifact (specs, changes, tasks) exclusively from PostgreSQL. Local enrollment (`POST /api/enrollment/local` → `POST /api/projects`) stores only `rootPath` + metadata; nothing ever reads `<rootPath>/openspec/`. As a result the UI renders seed fixtures regardless of which real repos are enrolled. Upstream OpenSpec (`Fission-AI/OpenSpec`) defines a stable Markdown grammar: `specs/<capability>/spec.md` with `## Requirements` → `### Requirement:` → `#### Scenario:`; `changes/<name>/specs/**/*.md` with `## ADDED/MODIFIED/REMOVED/RENAMED Requirements`; `tasks.md` checkbox lists; `config.yaml`. The upstream parser source (`src/core/parsers/`) is the authoritative grammar reference.

This change ports that grammar to a server-side parser and adds a projection layer that keeps the DB in sync with disk. It does NOT touch git clone (remote-git projects stay un-projected), ETag concurrency (INV-7), or audit emission (NFR-10) — those are separate changes.

## Goals / Non-Goals

**Goals:**
- Parse every artifact type OpenSpec produces (main spec, delta spec, tasks, config) into a stable in-memory model.
- Project a single enrolled local project's `openspec/` tree into the existing DB tables in one pass, idempotently and incrementally (content-hash skip).
- Keep the projection fresh via a chokidar watcher and a manual re-project endpoint.
- Expose projection status (`projected`, `lastProjectedAt`, `parseErrors[]`) to the UI.
- Never block request handling on projection; projection runs on a worker / queue.

**Non-Goals:**
- Git clone / fetch for `remote-git` enrolled projects (deferred to git integration).
- Per-section ETag + If-Match concurrency control (INV-7, separate change).
- Audit-log emission for projection events (NFR-10, separate change).
- Round-trip serialize→parse equality tests for every grammar edge (corpus tests cover the common shapes; full corpus is Phase 0 §0.2).
- Schema fork/scratch authoring UI (Phase 3).
- Multi-project collective projection aggregation (exists separately in `aggregation.ts`).

## Decisions

### D1: Port the upstream parser grammar, do not shell out to the `openspec` CLI
**Choice:** Re-implement the Markdown/delta/tasks grammar in TypeScript in `src/lib/openspec-parser/`, mirroring upstream `spec-structure.ts`, `requirement-blocks.ts`, `change-parser.ts`.
**Why:** Shelling out to `openspec` per file is slow (Node startup × N files), couples the dashboard to a CLI install the operator may not have, and the CLI's `--json` output shape is undocumented/unstable. A faithful port gives us control, testability, and zero runtime dep on the CLI.
**Alternatives considered:**
- Shell out to `openspec show --json` — rejected: startup overhead + undocumented JSON + CLI-not-installed failure mode.
- Vendor the upstream parser as a git submodule — rejected: upstream is ESM + has its own deps; a clean port keeps the surface small.

### D2: Content-hash-based incremental projection
**Choice:** Each content row (`specs`, `requirements`, `scenarios`, `changes`, `artifacts`, `deltaSpecs`, `tasks`) gains a `contentHash` column (SHA-256 of canonicalized source bytes). On projection, compute hash; skip upsert if it matches the stored value. Track `lastProjectedAt` + `projected` on `projects`.
**Why:** Re-parsing the whole tree on every watcher event is wasteful for repos with hundreds of changes; hashing a file is ~µs vs parsing ~ms. Idempotent upsert also makes manual re-project safe to call repeatedly.
**Alternatives:**
- mtime-based skip — rejected: mtime is not portable across filesystems and breaks on `git checkout`.
- Full re-parse every time — rejected: O(N) on every watcher fire.

### D3: Watcher per project, started lazily, debounced
**Choice:** A chokidar watcher is created the first time a local project is projected, watching `<rootPath>/openspec/**/*`. Events are debounced (500ms) and trigger an incremental projection. Watchers are stored in a module-level `Map<projectId, FSWatcher>` keyed by projectId; on project delete the watcher closes.
**Why:** One watcher per project isolates blast radius (one repo's churn doesn't re-scan others) and matches the per-project DB partitioning. Lazy start avoids watching 100 repos when only 5 are enrolled.
**Alternatives:**
- Single global watcher over all roots — rejected: coupling + harder to scope ignore rules.
- Polling instead of fs events — rejected: latency + CPU cost.

### D4: Projection runs off the request thread
**Choice:** `POST /api/projects/:id/project` enqueues a job (in-process queue, single worker per project to serialize writes) and returns 202 immediately with the job id. Status is polled via `GET /api/projects/:id/projection-status`. The queue is an in-memory FIFO with `Map<projectId, Promise>` so concurrent requests for the same project coalesce.
**Why:** Projection of a large repo can take seconds; blocking the HTTP handler violates non-interactive discipline and Next.js request timeouts.
**Alternatives:**
- Synchronous projection in the handler — rejected: blocks the event loop + request timeout risk.
- External queue (BullMQ/Redis) — rejected: out of scope, adds infra; in-process is enough for single-node dashboard.

### D5: Parse issues are non-fatal and collected, not thrown
**Choice:** The parser returns `{ model, issues: ParseIssue[] }`. Issues include line numbers + severity (`warn`/`error`). Projection upserts the parseable parts and records `parseErrors[]` on the project status. A delta spec with a `## MODIFIED` referencing a non-existent requirement is a `warn` (upsert what we can); a totally unparseable file is an `error` (record filename + reason, skip its rows).
**Why:** Real repos have hand-edited specs with drift; failing the whole projection on one bad file makes the dashboard useless. Surfacing issues lets the UI show "3 parse warnings" badges.
**Alternatives:**
- Fail-fast on any parse issue — rejected: one typo blanks the whole project.

### D6: Delete-then-reinsert within a transaction per (project, artifact-kind)
**Choice:** For each artifact kind (e.g. requirements for one capability), projection deletes rows whose source files disappeared and inserts/updates the rest, inside a single DB transaction per (project, kind). Content-hash skip means unchanged rows are neither deleted nor reinserted.
**Why:** Detecting removed files (a spec deleted on disk) requires a tombstone pass; delete-then-reinsert-with-hash-skip is simpler and transactionally safe.
**Alternatives:**
- Soft-delete + reconcile — rejected: more columns, more state, no clear win for a single-node dashboard.

### D7: `config.yaml` parsed with a hand-rolled subset, not a YAML lib
**Choice:** Parse only the keys the dashboard needs (`defaultSchema`, `profiles`, `tools`) with a tiny line-based parser. Unknown keys are ignored.
**Why:** Avoids adding `js-yaml` for ~10 lines of config. If the config grows, swap to `js-yaml` later.
**Alternatives:**
- Add `js-yaml` — deferred until config surface grows.

## Risks / Trade-offs

- **[Parser drift from upstream]** Upstream grammar evolves; our port can lag. → Mitigation: pin a documented upstream commit SHA in the parser header; add a "grammar version" constant; corpus tests assert against fixtures copied from upstream at that SHA.
- **[Large repo projection latency]** A repo with 500 changes × 4 artifacts = 2000 file parses on first run. → Mitigation: D2 hashing makes subsequent runs cheap; first run is one-time and runs off-thread (D4); log a warning if first-run > 5s.
- **[Watcher resource cost]** Many watchers × many files → fd exhaustion on low-ulimit hosts. → Mitigation: chokidar `usePolling: false` default; cap concurrent watchers (default 50); document `ulimit -n` recommendation.
- **[Concurrent write races]** Dashboard writes a file while watcher fires mid-parse. → Mitigation: debounce (D3) + content-hash skip means a second event shortly after reconciles; atomic writes (temp+rename) elsewhere reduce torn reads.
- **[Delete-then-reinsert window]** Brief moment where rows are absent mid-transaction. → Mitigation: transaction isolation (D6); UI reads are eventually-consistent by design.
- **[In-memory queue lost on crash]** Un-projected jobs vanish on process restart. → Mitigation: on startup, re-project any project with `projected=false` or whose `lastProjectedAt` is older than the newest file mtime; this is a background sweep, not request-blocking.
- **[Hash collision]** SHA-256 collision skips a real change. → Mitigation: astronomically unlikely; accept.

## Migration Plan

1. Add new columns (`contentHash` on content tables; `lastProjectedAt`, `projectionError` on `projects`) via `drizzle-kit push` — additive, no data loss.
2. Deploy parser + projection code; existing rows keep `contentHash=null`, treated as "always re-parse once".
3. On first request to `/specs` (or any page reading projected data), if `projected=false`, the background sweep triggers projection for all enrolled local projects.
4. Rollback: revert code; the new columns are nullable and ignored by old code. No data migration down needed.

## Open Questions

- Should projection also ingest `openspec/explorations/` and `openspec/initiatives/`? Current scope excludes them (no DB tables yet). → Deferred; add when those tables exist.
- Should the watcher coalesce cross-project events (e.g. a shared root)? → Assume no shared roots for now (enrollment allow-list already scopes per-repo).
- Exact `parseErrors[]` JSON shape on the status endpoint — left to task implementation, but MUST include `file`, `line?`, `severity`, `message`.
