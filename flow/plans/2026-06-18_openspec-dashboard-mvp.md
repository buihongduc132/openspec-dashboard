# Plan — OpenSpec Dashboard (phased, MVP-first)

> Implements `flow/requirements/*.md`. Read alongside
> `flow/findings/2026-06-18_openspec-data-model.md`. Cross-cutting invariants INV-1..INV-11
> are non-negotiable across every phase.
>
> This is a **plan**, not a spec. Each phase ends in a milestone gate (verifier-loop). No
> phase starts until the previous gate passes.

## §0 Open decisions (resolved in Round 2 — see requirements/README.md "Decisions")

All decisions D-* are now recorded in `flow/requirements/README.md`. Highlights that shape
the plan:

- **D-Audit**: audit log is **Phase 0** infrastructure (every Phase 1+ mutating endpoint
  emits to it; NFR-10 contract-tested from Phase 0).
- **D-ETag**: per-section ETag is a **Phase 0.3** deliverable (INV-7 from day 1).
- **D-SidecarLoc**: dashboard metadata under `openspec/.dashboard/`, gated by §8.9 empirical
  confirmation in Phase 0.
- **D-TaskID**: UUIDs; numbers display-only.
- **D-Auth**: Better-Auth (Lucia out).
- **D-BullMQ**: dropped from MVP; Redis only when a real async job exists.
- **D-Verify**: §6.1 is heuristic checks (not parity); LLM tier is Phase 3.
- **D-NFR5**: "documented rules" + gap registry + upstream-source retrieval task (Phase 0).
- **D-SQLite**: single-user-local only; NFR-7 (≥10 concurrent) scoped to Postgres.
- **D-MainSpecCRUD**: forbidden; main specs mutate via change+archive only.

## §1 Phase 0 — Foundations (1.5–2 weeks, gate: parse + sync + audit + ETag verified)

Goal: prove INV-1, INV-2, INV-3, INV-6, INV-7, NFR-3, NFR-4, NFR-5, NFR-10 end-to-end on a
real OpenSpec project repo before any feature UI.

### 0.1 Upstream-format empirical gates (req 08 §8.9)
- Confirm `openspec validate` ignores `openspec/.dashboard/`.
- Obtain workspace/context-store/schema-fork actual upstream formats.
- Attempt to obtain upstream parser source (`npm install openspec` / clone + de-bundle).
- **Output**: written findings under `flow/findings/`; amend D-SidecarLoc if gate 1 fails.

### 0.2 OpenSpec parser port (documented rules + gap registry)
- Port the Markdown grammar (Spec / Requirement / Scenario / RFC 2119).
- Port the delta grammar (ADDED / MODIFIED / REMOVED / RENAMED).
- Port `tasks.md` checkbox parser.
- **Enumerated documented-rule list** + gap registry (rules we cannot confirm without source).
- **Tests**: round-trip parse→serialize→parse on a corpus; property-based byte-fidelity
  tests on untouched regions (NFR-4).
- **Gate**: NFR-5 (documented-rule coverage) demonstrated; gaps tracked.

### 0.3 Filesystem projection + atomic writes + per-section ETag
- Project registration (local path + allowlist; remote clone with sandbox — req 01 §1.1).
- File watcher (chokidar) → in-memory projection rebuild; ignores own writes.
- Atomic write helper (temp-file + rename).
- **Per-section ETag middleware** on every mutating endpoint (INV-7); contract test that
  every POST/PUT/PATCH/DELETE requires `If-Match` and returns an ETag.
- **Tests**: simulate concurrent same-section vs different-section edits; verify INV-7.
- **Gate**: NFR-3 (<2s sync lag) under load; INV-7 different-section concurrent success.

### 0.4 Audit log + chain verifier (NFR-10)
- Append-only audit log with hash chain (req 09 §9.6).
- Chain verifier (unit-tested against tampered fixtures) + scheduled job.
- Audit-emission middleware on every mutating endpoint; contract test that every mutating
  endpoint emits exactly one audit record.
- **Gate**: NFR-10 contract test green; verifier detects tampering.

### 0.5 OpenAPI skeleton + health + read endpoints
- `GET /health`, `GET /projects`, `GET /projects/:id/specs`, `GET /projects/:id/changes`.
- OpenAPI 3.1 generation wired.
- **Gate**: OpenAPI validates; read endpoints work end-to-end against a real OpenSpec repo.

### 0.6 Threat model v1 (NFR-11)
- Document covering all Phase 0+1 surfaces (req 08 §8.10).
- **Gate**: reviewed at the Phase 0 milestone.

### 0.7 Verifier loop (milestone 0)
- 2 fresh verifiers, blind. Approve before Phase 1.

## §2 Phase 1 — MVP (3–4 weeks, gate: usable single-project tool, no auth)

Goal: a single user manages one project's specs (read + propose-via-change), changes,
tasks, and a Kanban board.

### 1.1 Spec module — read + propose (req 02)
- Spec list, detail (read-only with "propose via change" CTA), validate, search (FTS5).
- Spec impact analysis (parse all active changes; full conflict matrix from req 06 §6.4).

### 1.2 Change module (req 03.1–3.10, 3.13 single-archive)
- Change list, detail, create, metadata edit, artifact status, validate.
- Proposal + Design + Delta + Task editors (raw Markdown; structured assist for delta verbs
  + tasks).
- **Single-change archive** with inverse-patch recording (INV-4, INV-4a); bulk archive is
  Phase 2.

### 1.3 Task sidecar + Kanban (req 04.1–4.6, 4.11, 4.21, 4.22, 4.24)
- `openspec/.dashboard/tasks/<change>.json` v1 + migrator stub.
- UUID task IDs; reconciliation algorithm §4.21.
- Kanban board: default columns, drag-drop (dnd-kit — library-health recheck at Phase 0),
  card surface, persistence. `isDone` flag (not name).
- Task CRUD via board + Markdown sync.
- Concurrent-edit merge UI (3-way; INV-7).

### 1.4 Schema module — read + validate + resolution debug (req 05.1, 05.2, 05.7, 05.9)
- Three-layer listing, detail, validate, resolution debug.
- No create/fork/edit (Phase 2/3).

### 1.5 Dashboard — project overview (req 7.1) + activity timeline (req 7.3)
- Both depend on the Phase 0 audit log (already in place).

### 1.6 NFR measurement plumbing
- Lighthouse CI gate (NFR-1), k6 read-latency load test (NFR-2), index-freshness probe
  (NFR-6), axe-core per-component a11y tests (NFR-9) — wired from Phase 1, not deferred.

### 1.7 Verifier loop (milestone 1)

## §3 Phase 2 — Extended (3–4 weeks, gate: Wekan/Vikunja parity within a project)

### 2.1 Task richness (req 04.7–4.10, 4.12–4.20, 4.23)
- Swimlanes, filters, search (incl. comments + sub-checklists per INV-8), dependencies,
  assignments, labels, comments, sub-checklists, due dates, list view, calendar view,
  progress, bulk ops, real-time board updates.

### 2.2 Change richness (req 03.11, 03.12, 03.14–03.16)
- Artifact dependency graph viz, custom artifact support, bulk archive (full conflict
  matrix), change sync (no-archive), archive browsing + restore (INV-4a unrestorable state).

### 2.3 Spec richness (req 02.6, 02.8, 02.9)
- Version history/blame, spec impact (already in 1.1; ensure not double-scheduled), export.

### 2.4 Schema authoring (req 05.3, 05.4, 05.6, 05.8, 05.10)
- Create/fork (dashboard-side provenance), template management, activation, export/import.
- Visual editor (req 05.5) is **Phase 3** per D5 — NOT here.

### 2.5 Verification (req 06.1 heuristic tier, 06.2, 06.3, 06.4)
- Heuristic verifier, project-wide validation, validation dashboard, full-matrix conflict
  detection (already partly in 1.1; finalize UI here).

### 2.6 Verifier loop (milestone 2)

## §4 Phase 3a — Multi-user + RBAC (2–3 weeks)

### 3a.1 Auth + RBAC (req 09.1–09.4, 09.7)
- Better-Auth, email/password + OAuth, RBAC (Owner/Editor/Viewer), session-version
  invalidation, rate limiting. NFR-7 load test (Postgres).

### 3a.2 Workspaces + context stores + initiatives (req 01.7, 01.8)
- Server-side projection; CLI parity still deferred unless §8.9 gate confirmed formats.
- Cross-repo conflict detection (req 06.5) with fixture-corpus precision/recall gate.

### 3a.3 Verifier loop (milestone 3a)

## §5 Phase 3b — Integration (2–3 weeks)

### 3b.1 Teams + API tokens + leak detection (req 09.5, 09.10)
- Teams, scoped API tokens with trust-boundary matrix, leak-detection algorithm.

### 3b.2 Git integration (req 08.4)
- Commit-on-save, branch-per-change, auto-PR (push always explicit/opt-in).

### 3b.3 Webhooks + agent API (req 08.5, 08.6)
- Outbound (SSRF-hardened) + inbound (rotation policy) webhooks.
- Sandboxed agent JSON API with path-allowlist; "propose delta spec" → human review.

### 3b.4 LLM verifier tier (req 06.1d)
- Pluggable LLM-backed `/opsx:verify`-grade verifier.

### 3b.5 Verifier loop (milestone 3b)

## §6 Phase 4 — Analytics + polish + open-source release

### 4.1 Analytics (req 07.2, 07.4, 07.5, 07.6, 07.7)
- Multi-project dashboard, coverage, velocity, archive analytics, contributor analytics.

### 4.2 UI modernization pass
- The user's separate "make it modern" request. Design-system pass; perf budget enforcement
  (NFR-1, NFR-2); accessibility audit re-run (NFR-9).

### 4.3 Docs + demo + contribution guide

### 4.4 Public repo publication gate (req 09.8)
- Two-person manual; secret-scanned (history + working tree); repo name
  `openspec-dashboard`.

## §7 Requirement → Phase matrix (no orphans, no phantoms)

| Req | Phase | Req | Phase | Req | Phase |
|-----|-------|-----|-------|-----|-------|
| 1.1 | 0.3 / 3a | 3.10 | 1.2 | 6.1 (heuristic) | 2.5 |
| 1.2 | 0.5 | 3.11 | 2.2 | 6.1d (LLM) | 3b.4 |
| 1.3 | 1.2 (via config) | 3.12 | 2.2 | 6.2 | 2.5 |
| 1.4 | 1.4 | 3.13 | 1.2 | 6.3 | 2.5 |
| 1.5 | 1.5 | 3.14 | 2.2 | 6.4 | 1.1 + 2.5 |
| 1.6 | 1.5 | 3.15 | 2.2 | 6.5 | 3a.2 |
| 1.7 | 3a.2 | 3.16 | 2.2 | 7.1 | 1.5 |
| 1.8 | 3a.2 | 4.1 | 1.3 | 7.2 | 4.1 |
| 1.9 | 3a.1 | 4.2 | 1.3 | 7.3 | 1.5 |
| 2.1 | 1.1 | 4.3 | 1.3 | 7.4 | 4.1 |
| 2.2 | 1.1 | 4.4 | 1.3 | 7.5 | 4.1 |
| 2.3 | 1.1 | 4.5 | 1.3 | 7.6 | 4.1 |
| 2.4 | 1.1 | 4.6 | 1.3 | 7.7 | 4.1 |
| 2.5 | 1.1 | 4.7 | 2.1 | 8.1 | 0.5 + rolling |
| 2.6 | 2.3 | 4.8 | 2.1 | 8.2 | 0.3 |
| 2.7 | 1.1 | 4.9 | 2.1 | 8.3 | 0.3 |
| 2.8 | 1.1 | 4.10 | 2.1 | 8.4 | 3b.2 |
| 2.9 | 2.3 | 4.11 | 1.3 | 8.5 | 3b.3 |
| 3.1 | 1.2 | 4.12 | 2.1 | 8.6 | 3b.3 |
| 3.2 | 1.2 | 4.13 | 2.1 | 8.7 | 0.3 (contract) |
| 3.3 | 1.2 | 4.14 | 2.1 | 8.8 | 4.1 |
| 3.4 | 1.2 | 4.15 | 2.1 | 8.9 | 0.1 |
| 3.5 | 1.2 | 4.16 | 2.1 | 8.10 | 0.6 + rolling |
| 3.6 | 1.2 | 4.17 | 2.1 | 9.1 | 3a.1 |
| 3.7 | 1.2 | 4.18 | 2.1 | 9.2 | 3a.1 |
| 3.8 | 1.2 | 4.19 | 2.1 | 9.3 | 3a.1 |
| 3.9 | 1.2 | 4.20 | 1.5 (progress) / 4.1 (velocity) | 9.4 | 3a.1 |
|   |   | 4.21 | 1.3 | 9.5 | 3b.1 |
|   |   | 4.22 | 1.3 | 9.6 | 0.4 |
|   |   | 4.23 | 2.1 | 9.7 | 3a.1 |
|   |   | 4.24 | 1.3 | 9.8 | 4.4 |
|   |   |   |   | 9.9 | 1.5 (metadata) / 3a (full) |
|   |   |   |   | 9.10 | 3b.1 |

(No "11.x" — phantom eliminated. No requirement is unmapped.)

## §8 Cross-phase infrastructure

- **CI**: lint, typecheck, test (unit + integration + property), secret scan (gitleaks),
  OpenAPI contract check, Markdown round-trip property tests, **Lighthouse CI (NFR-1)**,
  **k6 load (NFR-2)**, **axe-core a11y (NFR-9)**, **audit-emission contract (NFR-10)**,
  **chain-verifier (NFR-10)**.
- **Observability**: structured logs, request metrics, watcher-health probes, audit-chain
  health alerts.
- **Migrations**: every sidecar/schema version bump ships a tested migrator.
- **Backups**: canonical filesystem snapshots + dashboard-metadata + audit-log archive.

## §9 Risk register (complete)

| Risk | Mitigation |
|------|-----------|
| Markdown round-trip drift breaks CLI compat | Property-based tests on fixture corpus; CI runs upstream `openspec validate` on our outputs (Phase 0 §0.1 source retrieval) |
| Watcher reliability across OSes | chokidar + per-OS smoke tests; fallback polling if watcher unhealthy |
| Sidecar ↔ Markdown desync | §4.21 reconciliation on every read; low-confidence warnings surfaced |
| Concurrent editor data loss | Per-section ETag (INV-7) from Phase 0.3; merge UI; never silent overwrite |
| Public-repo secret leak | Pre-commit + pre-push + CI gitleaks (history); two-person publication gate (req 09.8) |
| Upstream OpenSpec schema/CLI changes | Pin a supported version; compat matrix in docs; upgrade path tested |
| Scope creep from "Wekan/Vikunja parity" | Phase gates; defer non-MVP labels/comments/calendar to Phase 2 explicitly |
| **Upstream parser source unavailable (NFR-5)** | §0.1 retrieval task; downgrade to documented rules + gap registry; tracked gaps |
| **Sidecar breaks `openspec validate`** | §0.1 gate 1; relocate sidecar outside `openspec/` if it fails; D-SidecarLoc amended |
| **Audit-log dependency inversion** | Audit log is Phase 0 (§0.4), not Phase 3 |
| **Lucia deprecated** | Better-Auth chosen (D-Auth) |
| **BullMQ/Redis undeclared** | BullMQ dropped from MVP (D-BullMQ); Redis only when a real async job exists |
| **SQLite vs NFR-7 (≥10 editors)** | NFR-7 scoped to Postgres; SQLite is single-user-local only |
| **Path traversal / clone RCE / SSRF / tenant isolation** | Threat model (§0.6, req 08 §8.10); path allowlist, clone sandbox, webhook egress filter, tenant boundary |
| **Phase 3 overload** | Split into 3a (auth/RBAC/workspaces) and 3b (integration/teams/tokens) |
| **Invented upstream formats (workspace/context-store/schema-fork)** | §0.1 gates; server-side projection until formats confirmed |
| **Stable task ID instability** | UUIDs (D-TaskID); numbers display-only |
| **Direct main-spec CRUD breaking SDD model** | Forbidden (D-MainSpecCRUD); change+archive only |
| **Round-trip contract ambiguity** | Region-scoped byte fidelity (INV-2) + Authority Contract table |
| **Restore clobbered by newer change** | INV-4a unrestorable state, explicitly documented |

## §10 Definition of done (per phase)

1. Every requirement in the phase's scope (per §7 matrix) has ≥1 automated test exercising
   its AC.
2. The phase's verifier loop has converged (table per verifier-loop skill).
3. INV-1..INV-11 still hold (regression suite green).
4. NFRs in scope are met and demonstrated with measurements (per NFR "Measurement" column).
5. The milestone demo runs against a real OpenSpec project repo — **including Phase 0**
   (§0.5 + §0.7 run against a real repo, not just fixtures).

## §11 Out of scope (explicit, requires user confirmation)

The user's verbatim request included two downstream asks recorded in
`flow/intentions/2026-06-18_openspec-management-server.md`:

1. **"Now improve this UI for me. Make it modern"** — scheduled as Phase 4.2 (UI
   modernization pass). It is deferred because there is no UI to modernize until Phase 1
   ships.
2. **"make it the public repository with same name and commit and push all changes"** —
   scheduled as Phase 4.4 (public-repo publication gate). It is deferred because publishing
   an empty/codeless repo serves no purpose, and the secret-hygiene gate (req 09.8) requires
   the codebase to exist first.

**These deferrals need user confirmation.** If the user wants either pulled forward (e.g.,
stand up a minimal UI now and modernize iteratively, or publish the repo immediately as a
placeholder), the plan is amended.
