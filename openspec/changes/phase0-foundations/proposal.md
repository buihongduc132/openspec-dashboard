## Why

Phase 1 features (spec module, change module, kanban) depend on four foundation capabilities that do not yet exist in code: a faithful OpenSpec Markdown parser, a filesystem projection with per-section ETag concurrency, a tamper-evident audit chain, and an OpenAPI/health skeleton. Building features on top of unverified foundations is how INV-1/INV-2/INV-6/INV-7/NFR-5/NFR-10 get silently violated. This change proves those invariants end-to-end on a real OpenSpec repo before any feature UI, exactly per plan §1's gate.

## What Changes

- **§0.1 Empirical upstream-format gates (req 08 §8.9):** confirm `openspec validate` ignores `openspec/.dashboard/` (binary success criteria, pre-committed fallback path `<repo>/.openspec-dashboard/`); obtain workspace/context-store/schema-fork actual formats; attempt upstream parser source retrieval (NFR-5 gap registry). Each gate produces a written finding under `flow/findings/`.
- **§0.2 OpenSpec parser port:** re-implement the Markdown grammar (Spec/Requirement/Scenario/RFC 2119), the delta grammar (ADDED/MODIFIED/REMOVED/RENAMED), and the `tasks.md` checkbox parser from documentation; produce an enumerated documented-rule list + gap registry; round-trip parse→serialize→parse corpus tests.
- **§0.3 Filesystem projection + atomic writes + per-section ETag (INV-7):** local project registration with path allowlist; chokidar watcher rebuilding an in-memory projection (ignores own writes); atomic write helper (temp+rename); per-section ETag middleware on every mutating endpoint per the Section Granularity Table; concurrent same-section (409) vs different-section (both succeed) contract tests.
- **§0.4 Audit log + hash-chain verifier (NFR-10):** per-project append-only audit log with SHA-256 hash chain, single-writer append queue, defined `entryBody` schema, chain verifier (tamper-detecting) + scheduled job, read-only-quarantine incident response on chain break, audit-emission middleware.
- **§0.5 OpenAPI skeleton + health + read endpoints:** `GET /health`, `GET /projects`, `GET /projects/:id/specs`, `GET /projects/:id/changes`; OpenAPI 3.1 generation wired.
- **§0.6 Secret hygiene (completes the partial state):** extend `.gitignore` to pre-ignore `.openspec-dashboard/`; add `.gitleaks.toml`; wire pre-commit + pre-push gitleaks hooks + CI gate; **scan the already-pushed public history** (`e8a516f`, `39cb79b`, all refs) as a prerequisite — clean → proceed / dirty → rewrite history.
- **§0.7 Threat model v1 (NFR-11):** living document covering all Phase 0+1 surfaces (path traversal, clone RCE, agent write path-confinement, webhook forgery/SSRF, multi-tenant isolation, public-repo publication).
- **§0.8 Verifier-loop milestone 0.**
- This change does NOT build feature UI, auth, git/webhooks, or schema authoring (those are later phases).

## Capabilities

### New Capabilities
- `openspec-parser`: Re-implemented TypeScript OpenSpec Markdown/delta/tasks parser producing a stable in-memory model; documented-rule enumeration + gap registry (req 08 §8.9 gate 4, plan §0.2, NFR-5).
- `filesystem-projection`: Project registration (local path + allowlist), chokidar watcher → in-memory projection rebuild (<2s, NFR-3), atomic writes (temp+rename), per-section ETag middleware enforcing INV-7, watcher self-write suppression (req 08 §8.2, §8.3, INV-7).
- `audit-chain`: Per-project append-only audit log with SHA-256 hash chain, single-writer append queue, defined `entryBody` schema, tamper-detecting chain verifier + scheduled job, read-only-quarantine on chain break, audit-emission contract on mutating endpoints (req 09 §9.6, NFR-10, D-Audit).
- `api-foundation`: `GET /health` + read-only project/spec/change list endpoints + OpenAPI 3.1 generation (req 08 §8.1, plan §0.5).
- `secret-hygiene-gate`: `.gitignore` extension, `.gitleaks.toml`, pre-commit + pre-push + CI gitleaks gates, history scan of already-pushed refs (req 09 §9.8, plan §0.6).
- `threat-model-v1`: Living threat-model document covering Phase 0+1 surfaces (req 08 §8.10, NFR-11).

### Modified Capabilities
_(none — greenfield repo, `openspec/specs/` is empty. The existing `build-openspec-dashboard-mvp` dashboard-foundation spec is superseded-in-scope by these tighter, phase-scoped capabilities; this change owns Phase 0.)_

## Impact

- **Code**: new `src/lib/openspec-parser/` (Markdown/delta/tasks grammar + serializer), `src/lib/projection/` (watcher + atomic writes + ETag middleware), `src/lib/audit/` (chain append/verify/quarantine), `src/app/api/{health,projects,projects/[id]/specs,projects/[id]/changes}/route.ts`, `src/app/api/middleware/etag.ts`, `.gitleaks.toml`, git hook wiring, threat-model doc under `flow/findings/` or `docs/threat-model/`.
- **APIs**: 4 new read-only GET endpoints + 1 health endpoint; ETag middleware (no mutating endpoints exist yet — middleware is built + contract-tested against a Phase-1-stand-in stub route so INV-7 is proven before Phase 1).
- **Dependencies**: `chokidar` (watcher), `zod` (entryBody + OpenAPI request validation) if not already present; `.gitleaks.toml` + a hook runner (lefthook or husky); no new runtime deps beyond these (parser is in-tree, not a dependency).
- **Data**: per-project audit-log files written under the sidecar location (path resolved by §0.1 gate 1). **The existing `audit_logs` Postgres table (`src/db/schema.ts`) is reconciled in Phase 0, not ignored**: it is retained as a query/mirror surface (UI activity feeds, structured queries) but is NOT the source of truth for the hash chain (D-Audit puts the chain on the filesystem). Phase 0 wires the audit-emission middleware to write BOTH the filesystem chain entry AND a best-effort row into `audit_logs`; the filesystem chain is authoritative on conflict. A migration backfills existing `audit_logs` rows into the filesystem chain at Phase 0 cutover so no history is lost.
- **Systems**: CI gains gitleaks job + a watcher-integration smoke job; the scheduled chain-verifier job runs (cron or Next.js cron-equivalent).
- **Testing**: cites the `testing-standard` capability (INV-9 / D-TDD / NFR-12); parser/projection/audit tasks are TDD-first with property-based round-trip corpus tests (NFR-4).
