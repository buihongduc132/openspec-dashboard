## Context

Phase 0 is the foundations milestone of the OpenSpec Dashboard (Next.js 16 App Router + Drizzle + Postgres + React 19 + Tailwind). It must prove INV-1/INV-2/INV-6/INV-7, NFR-3/4/5/10/11 end-to-end on a real OpenSpec repo before any feature UI lands in Phase 1. The codebase today has no parser, no projection, no audit chain, no ETag middleware, and only partial secret hygiene (`.gitignore` committed at `39cb79b`, but no gitleaks hooks and no history scan). The existing `build-openspec-dashboard-mvp` mega-proposal declared these but only specced 3 requirements loosely; this change replaces that slice with tight, testable, phase-scoped specs.

The testing discipline (INV-9 / D-TDD / NFR-12) is owned by the separate `tdd-coverage-standard` capability/change. **This change cites `testing-standard`; it does not restate the thresholds.** Every implementation task below is TDD-first.

Constraints: parser re-implemented from docs (upstream source bundled/unavailable, NFR-5); audit log filesystem-backed per D-Audit (not Postgres); sidecar location resolved empirically by §0.1 gate 1 with a pre-committed fallback constant; Phase 0 registers LOCAL paths only (remote clone sandbox deferred to threat-model sign-off).

## Goals / Non-Goals

**Goals:**
- Prove INV-7 (per-section ETag concurrency) with a contract-tested middleware BEFORE Phase 1 needs it.
- Prove NFR-4 (byte-fidelity round-trip) with a property-based parser corpus.
- Prove NFR-10 (audit chain) with tamper-detection fixtures + emission contract.
- Land the empirical §0.1 gates as written findings (sidecar coexistence, upstream formats, source retrieval) so Phase 1 builds on confirmed facts.
- Close the partial secret-hygiene gap (gitleaks hooks + the one-time history scan).
- Ship the threat model v1 covering Phase 0+1 surfaces.

**Non-Goals:**
- Any feature UI (spec/change/kanban modules = Phase 1).
- Auth, RBAC, teams (Phase 3a).
- Remote git clone execution (the sandbox is designed in the threat model; execution is deferred until the threat-model sign-off — Phase 0 registers local paths only).
- LLM verifier, visual schema editor, webhooks, agent write API execution (Phase 3b; the threat model addresses these forward-looking).
- Postgres-backed audit log (D-Audit puts the chain on the filesystem; Postgres may mirror later but is not the source of truth in Phase 0).

## Decisions

### D0-1: Parser is in-tree TypeScript, hand-written, not a dependency
**Decision:** Re-implement the OpenSpec Markdown/delta/tasks grammar in `src/lib/openspec-parser/` from documentation, not via `npm install openspec` (source is bundled/unavailable per NFR-5) and not via a regex soup.

**Why:** NFR-5 mandates a documented-rule enumeration + gap registry; the only honest way to produce that is to implement from the documented rules ourselves. A bundled-parser dependency would hide the rule boundary and break the gap-registry contract.

**Alternatives:** `unified`/`remark` AST pipeline (too heavy for this grammar; we'd still hand-write the OpenSpec node types), or `markdown-it` plugin (same). A hand-written recursive-descent parser over the line-oriented grammar is simplest and most auditable for byte-fidelity tests.

### D0-2: Watcher is chokidar with debounce + in-process self-write marker
**Decision:** `chokidar` watches `openspec/` (canonical) + the sidecar location; a `debounce(500ms)` batches bulk events; an in-process `Set<filePath>` of just-written paths lets the watcher ignore its own atomic writes.

**Why:** chokidar is the established cross-OS watcher in the Node ecosystem with move/delete/bulk-op survival. The self-write marker is the standard fix for the feedback loop where our own rename triggers a reconciliation that re-reads what we just wrote.

**Alternatives:** Node `fs.watch` (per-OS bugs, no batching), polling-only (NFR-3 <2s is hard with conservative poll intervals), a kernel-only watcher with no self-write suppression (reconcile loop). chokidar + marker wins.

### D0-3: Audit chain is a filesystem appender per project, single-writer via a per-project mutex
**Decision:** Each project has one audit file under the sidecar location; appends go through a per-project async mutex (a serialized promise chain) so no two appends read the same `prevHash`. The hash is computed before append; the append is atomic (`O_APPEND` + a single `write` of the full line).

**Why:** D-Audit makes the chain filesystem-backed. A per-project mutex is enough (NFR-7's ≥10-concurrent-editors concern is about data loss, not audit throughput; the mutex serializes only the chain append, not the user-facing mutation). Filesystem appends survive process restart; on restart the last persisted hash is re-read as the chain head.

**Alternatives:** SQLite per-project (extra dependency, migration surface), Postgres (D-Audit defers this), a global mutex (needlessly serializes unrelated projects). Per-project file + mutex is minimal.

### D0-4: ETag middleware is generic, section-granularity lives in a per-route resolver
**Decision:** One `withEtag(handler, sectionResolver)` middleware wraps mutating routes; the `sectionResolver(request, body)` returns `{ sectionKey, sectionBytes }` for that route per the Section Granularity Table. The middleware computes the ETag, checks `If-Match`, and on success bumps `monotonicVersion` and returns the new ETag.

**Why:** Section granularity differs per artifact type (task line vs. requirement block vs. whole-file); hard-coding it in the middleware would force every route through one shape. A resolver per route keeps the middleware generic and the table authoritative.

**Alternatives:** Per-route ETag logic (duplication, drift), a single file-level ETag (violates INV-7 — different sections would falsely conflict). Generic middleware + resolver is correct.

### D0-5: §0.1 gate 1 is a single location constant with a testable binary outcome
**Decision:** `SIDECAR_LOCATION` is a single constant (default `'openspec/.dashboard/'`); a Phase 0 task runs `openspec validate` against a fixture with sidecar files and asserts zero findings on the sidecar dir. If it fails, the constant flips to `'.openspec-dashboard/'` and a finding is committed. Every spec requirement that references the sidecar path reads through this constant.

**Why:** req 08 §8.9 demands the switch be atomic via one constant. Making it a constant (not a string literal per call site) is what makes the fallback actually atomic and testable.

**Alternatives:** Per-call-site strings (the failure mode §8.9 explicitly warns against), a runtime config with a flag (overkill — the outcome is one binary test at Phase 0).

### D0-6: History scan is a one-time gating task, outputs a finding, not a permanent CI job
**Decision:** The already-pushed history scan runs ONCE in Phase 0; its outcome is a written finding (`flow/findings/`). The permanent CI job scans only new history (the pre-push hook + CI gate on PRs cover the forward case).

**Why:** Scanning the same pushed history forever wastes CI time and conflates the one-time remediation with the ongoing gate. req 09 §9.8(b) requires history coverage; the one-time scan satisfies it for the already-pushed refs, and the forward hooks keep it satisfied.

**Alternatives:** Permanent full-history CI scan (slow, redundant), skip the one-time scan (leaves the owned deviation unverified — explicitly rejected by the plan).

### D0-7: Phase-1-stand-in stub mutation route for the audit-emission contract
**Decision:** Because Phase 0 has no real feature mutating endpoints, a stub `POST /api/__stub/mutate` route is added that goes through the ETag middleware + audit emission. The NFR-10 contract test targets it. It is REMOVED at the Phase 1 boundary (Phase 1 wires real mutating endpoints, and the contract test then targets those).

**Why:** NFR-10 demands the emission contract be proven from Phase 0. Without a stand-in, the contract test would be un-runnable until Phase 1, leaving INV-7 + the audit emission unverified at the Phase 0 gate — the exact gap Phase 0 exists to close. The stub is explicitly temporary and tracked for removal.

**Alternatives:** Defer the contract test to Phase 1 (rejects the Phase 0 gate purpose), or build a real Phase 1 endpoint early (scope creep into Phase 1). The stand-in is the honest minimum.

### D0-8: Existing `audit_logs` Postgres table is a mirror, not the source of truth
**Decision:** The `audit_logs` table already present in `src/db/schema.ts` (id, projectId, action, entityType, entityId, details, author, createdAt) is RETAINED as a query/mirror surface for UI activity feeds and structured queries. It is NOT the source of truth for the hash chain. The Phase 0 audit-emission middleware writes BOTH: (1) the authoritative filesystem chain entry (per D-Audit + D0-3), and (2) a best-effort row into `audit_logs` with matching fields. On any conflict or verification gap, the filesystem chain wins. A one-time Phase 0 cutover migration backfills existing `audit_logs` rows into the filesystem chain (chained from genesis in their `createdAt` order) so no prior history is lost.

**Why:** D-Audit makes the chain filesystem-backed; reverting that to Postgres would re-introduce the tamper-surface the chain exists to close. But the `audit_logs` table already exists and deleting it would lose structured-query capability the UI needs. The honest reconciliation is: filesystem = truth (chain, verifiability, INV-4 restorability), Postgres = mirror (fast queries, activity feeds). The backfill closes the history gap so the chain is complete from project inception, not from the Phase 0 cutover.

**Alternatives:** Drop `audit_logs` (loses query surface + forces every UI read through filesystem parsing), make Postgres the chain source (rejects D-Audit), or ignore the existing table and let it drift (silent staleness). Filesystem-truth + Postgres-mirror + backfill is the only option that preserves both D-Audit and the existing schema.

### D0-9: ETag version counter persists to the sidecar, not in-memory only
**Decision:** The per-section `monotonicVersion` (a component of INV-7 ETags) is persisted to a single `etags.json` per project in the sidecar (`{ sectionKey → { version, hash } }`), reloaded on startup before any mutating endpoint is served. Bumps are atomic (temp + rename).

**Why:** An in-memory-only counter changes every ETag on server restart, silently invalidating every in-flight client edit and producing false 409s — a correctness hole, not an optimization. Persistence is required for INV-7 to hold across restarts. The sidecar is the natural home (it already holds dashboard-private state per D-SidecarLoc) and a single JSON file per project is the minimal atomic-write surface.

**Alternatives:** Postgres-backed version counter (couples ETag correctness to DB availability — a DB outage would break optimistic concurrency), per-file sidecar files (more I/O, more partial-write risk than one JSON). One `etags.json` per project + atomic writes is minimal and correct.

## Risks / Trade-offs

- **[Parser drift from upstream]** Re-implementing from docs risks diverging from undocumented upstream behavior. → NFR-5 gap registry is the mitigation: divergence is a tracked bug against the registry, not a silent INV-3 violation. The §0.1 source-retrieval attempt (npm install / de-bundle) closes gaps where possible.
- **[chokidar cross-OS variance]** macOS FSEvents, Linux inotify, Windows ReadDirectoryChangesW have different latency/reliability. → NFR-3 (<2s) is tested under load per OS; a polling fallback is documented if a watcher proves unhealthy on a supported OS.
- **[Per-project audit mutex contention]** A very-high-write project serializes its chain appends. → Acceptable for Phase 0/1 scale; the mutex is per-project so unrelated projects aren't blocked. NFR-7 multi-user load test lands in Phase 3a; if contention shows up there, the chain can mirror to Postgres without changing the filesystem source of truth.
- **[Stub route left in by accident]** The Phase-1-stand-in stub could ship to prod if Phase 1 forgets to remove it. → Task tracked for explicit removal; knip dead-code gate (testing-standard) flags it; the route is namespaced `__stub` so it is greppable.
- **[Sidecar fallback path triggers late]** If §0.1 gate 1 fails, every spec already written for `openspec/.dashboard/` needs the constant to flip — but because it IS a constant (D0-5), no prose changes are needed, only the constant + a finding. This is the designed-in resilience.
- **[History scan finds a secret]** The one-time scan could surface a real leaked credential, forcing a history rewrite of a PUBLIC repo. → This is the gate's job; the plan §0.6 already owns this outcome (rewrite + force-update + rotate). No mitigation beyond executing the gate honestly.
