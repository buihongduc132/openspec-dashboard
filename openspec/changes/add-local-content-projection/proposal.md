## Why

Enrolling a local OpenSpec project today only persists metadata (`rootPath`, `name`, `enrollmentSource`). The dashboard never reads `<rootPath>/openspec/` on disk, so every page (`/specs`, `/changes`, `/kanban`) renders seed fixtures only — the project's real specs, changes, and tasks are invisible. This is the core gap blocking the dashboard from being a real management surface.

## What Changes

- Add a server-side OpenSpec Markdown parser that reads `openspec/specs/<capability>/spec.md`, `openspec/changes/<name>/{proposal,design,tasks}.md` + `openspec/changes/<name>/specs/**/*.md`, and the archived change tree under `openspec/changes/archive/`, producing a stable in-memory model (capability → requirements → scenarios; change → deltas → tasks).
- Add a filesystem projection that walks `<rootPath>/openspec/` for each enrolled local project and upserts parsed content into the existing `specDomains`, `specs`, `requirements`, `scenarios`, `changes`, `artifacts`, `deltaSpecs`, and `tasks` tables. Remote-git and non-existent roots are skipped with an explicit reason.
- Add an on-demand re-project endpoint (`POST /api/projects/:id/project`) and a background watcher (chokidar) that rebuilds the projection on file change, ignoring the dashboard's own writes.
- Set `projects.projected = true` after a successful full projection and record a per-file content hash so unchanged files are skipped on subsequent runs (incremental projection).
- Surface projection status (`projected`, `lastProjectedAt`, `parseErrors[]`) on the project read endpoints so the UI can show "stale / errored / fresh" badges.

## Capabilities

### New Capabilities
- `openspec-parser`: Server-side TypeScript parser for OpenSpec Markdown grammar (Spec/Requirement/Scenario headers, delta ADDED/MODIFIED/REMOVED/RENAMED sections, `tasks.md` checkboxes, `config.yaml`), producing a documented in-memory model + non-fatal parse-issue list. Ported from upstream `Fission-AI/OpenSpec` parser semantics.
- `content-projection`: Per-project filesystem projection that walks `<rootPath>/openspec/`, parses artifacts via `openspec-parser`, and upserts rows into existing tables with content-hash-based incremental skipping, chokidar-backed watch, and a manual re-project endpoint.
- `projection-status`: Read-only status surface (`projected`, `lastProjectedAt`, `parseErrors[]`) exposed on project endpoints and a dedicated `GET /api/projects/:id/projection-status`, so the UI can render freshness/error badges without re-reading disk.

### Modified Capabilities
<!-- No existing spec requirements change. The dashboard has no specs covering the current DB-only read path; this change introduces the projection as new behavior. -->

## Impact

- **Code**: new `src/lib/openspec-parser/` module, new `src/lib/projection/` module (scanner, hasher, upsert, watcher), new API routes under `src/app/api/projects/[id]/project/` and `.../projection-status/`, additions to `src/app/api/projects/[id]/route.ts` to surface status fields, schema additions (`lastProjectedAt`, `projectionError` columns on `projects`; per-row `contentHash` on content tables).
- **APIs**: new `POST /api/projects/:id/project`, new `GET /api/projects/:id/projection-status`; `GET /api/projects` and `GET /api/projects/:id` gain `projected`, `lastProjectedAt`, `parseErrors` fields.
- **Dependencies**: adds `chokidar` for file watching; `gray-matter` optional for `config.yaml` parsing (or hand-rolled YAML subset). No breaking changes to existing routes.
- **Systems**: dashboard dev/prod processes gain a long-lived watcher per enrolled local project; first projection of large repos (hundreds of changes) may take seconds — must be non-blocking and resumable.
- **Out of scope**: git clone for remote-git enrolled projects (still deferred to git integration phase), ETag/concurrency (separate INV-7 work), audit chain emission for projection events (separate NFR-10 work), schema fork/scratch authoring.
