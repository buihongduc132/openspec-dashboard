# Requirements — OpenSpec Management Server (index)

Strong-voice functional requirements, derived from
`flow/intentions/2026-06-18_openspec-management-server.md` and grounded in
`flow/findings/2026-06-18_openspec-data-model.md`.

Numbering: `<group>.<requirement>`. Each requirement carries acceptance criteria (AC) and
non-goals. Non-functional requirements (NFRs) live at the bottom of this index.

## Files in this group

| # | File | Domain |
|---|------|--------|
| 01 | `01-project-workspace.md` | Project registration, config, doctor, workspaces, context stores, initiatives |
| 02 | `02-specs.md` | Spec / Requirement / Scenario **read + change-mediated mutation**, validation, search, impact, history |
| 03 | `03-changes-artifacts.md` | Change lifecycle, artifacts (proposal/design/specs/tasks), archive flow |
| 04 | `04-tasks-kanban.md` | Task projection to Kanban (Wekan/Vikunja feature set), Markdown round-trip |
| 05 | `05-schemas.md` | Schema CRUD, forking, activation, validation, template editing |
| 06 | `06-verification-quality.md` | Heuristic verification (parity clarified), validation dashboard, conflict detection |
| 07 | `07-dashboard-analytics.md` | Overview, activity timeline, coverage, velocity, archive analytics |
| 08 | `08-integration-sync.md` | CLI parity API, filesystem sync, Git/webhooks, agent JSON API |
| 09 | `09-auth-multitenancy.md` | Auth, RBAC, teams, audit log |

## Cross-cutting invariants (apply to EVERY requirement)

> Non-negotiable. If a feature violates one, the feature is wrong.

- **INV-1 Filesystem is truth (canonical artifacts only).** The **canonical** OpenSpec
  artifacts (`openspec/specs/`, `openspec/changes/<name>/{proposal,design,specs,tasks}.md`,
  `openspec/schemas/`, `openspec/config.yaml`) map 1:1 to files and are never shadowed by DB
  state. **Dashboard-owned metadata** (task IDs, assignees, labels, comments, drafts,
  tombstones) lives under `openspec/.dashboard/` — a dashboard-private subtree that is NOT a
  canonical OpenSpec artifact and is explicitly excluded from `openspec validate` scope (see
  req 08 §8.9 for the empirical-confirmation gate).
- **INV-2 Region-scoped byte fidelity.** A save rewrites ONLY the bytes of the explicitly
  edited region (a task line, a requirement block, a scenario). No global whitespace
  normalization. No reformatting of untouched prose. Numbers in `tasks.md` are
  **display-only metadata** (see req 04 §4.1) — reordering or renumbering NEVER rewrites
  canonical Markdown numbers; numbers are recomputed on read from sidecar order.
- **INV-3 CLI parity for canonical state.** Any state the `openspec` CLI can produce, the
  dashboard can produce; any canonical state the dashboard produces, the CLI can consume.
  Dashboard-only metadata under `openspec/.dashboard/` is explicitly out of CLI-parity
  scope and is documented as such.
- **INV-4 Non-destructive, cross-session restorable.** No archive, delete, or merge is
  irreversible. Soft-delete tombstones are persisted in the audit log (not session memory),
  so restore works across sessions, server restarts, and tab closes. The only exception is
  INV-4a (below).
- **INV-4a Restore can be permanently blocked by conflict — and that is documented.** An
  archive restore that would clobber a newer change's modifications is permanently blocked
  with a structured "unrestorable" state and a recorded reason. This is the SOLE, explicit
  exception to INV-4 and is surfaced to the user at restore time.
- **INV-5 Dashboard metadata is mandatory for board mode; versioned; Markdown-valid
  without it.** The sidecar is REQUIRED to use Kanban/comment/due-date features (a degraded
  read-only board exists without it). Sidecar has a versioned schema. Canonical Markdown
  remains valid OpenSpec if the sidecar is deleted.
- **INV-6 Validation before write (canonical only).** No canonical artifact write reaches
  disk without passing the documented upstream `openspec validate` rule set. Dashboard
  metadata writes are validated against their own versioned schema, not OpenSpec rules.
- **INV-7 Per-section optimistic concurrency.** Mutating endpoints require `If-Match` on a
  **section-scoped ETag** (per task, per requirement, per scenario, per artifact), NOT a
  file-level ETag. Two users editing different sections of the same file MUST both succeed.
  Concurrent edits to the SAME section are rejected with a 409 and a merge UI (req 04 §4.23).
- **INV-8 Searchable by default (canonical + dashboard entities).** Any canonical artifact
  OR dashboard entity (tasks, comments, sub-checklist items, proposals, designs) is indexed
  for full-text search within its project scope within 2s of write.

## Authority contract (Markdown vs sidecar — definitive)

| Field                  | Lives in       | Winner on conflict | Reconciliation                         |
|------------------------|----------------|--------------------|----------------------------------------|
| Task title / body      | Markdown       | Markdown           | Sidecar mirrors on read                |
| Task completion `- [x]`| Markdown       | Markdown           | Sidecar `status` derived from it       |
| Task numeric order     | Sidecar        | Sidecar            | Numbers recomputed on read; Markdown untouched |
| Assignees / labels     | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Due date / priority    | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Comments / sub-checks  | Sidecar        | Sidecar            | Markdown has no equivalent             |
| Requirement/scenario   | Markdown       | Markdown           | Sidecar has no equivalent              |

The **"Done" column** is identified by a stable `isDone: true` flag in the column config,
NOT by column name, so renaming the Done column never silently changes completion semantics.

## Non-functional requirements (NFRs)

| # | NFR | Target | Measurement (owner phase) |
|----|-----|--------|---------------------------|
| NFR-1 | First-contentful paint (UI) | < 1.5s cold, < 500ms warm | Lighthouse CI gate (Phase 1 onward) |
| NFR-2 | API p50/p99 (single-project read) | < 100ms / < 500ms | k6 load test in CI (Phase 1 onward) |
| NFR-3 | Filesystem sync lag | < 2s disk→UI | Watcher probe + latency histogram (Phase 0) |
| NFR-4 | Region-scoped byte fidelity | 100% structural; untouched bytes frozen | Property-based round-trip corpus (Phase 0) |
| NFR-5 | Validator coverage | 100% of **documented** upstream rules; gaps tracked in a registry | Enumerated rule list + gap registry (Phase 0); upstream-source retrieval task (Phase 0) |
| NFR-6 | Search recall | 100% of in-scope entities indexed < 2s after write | Index-freshness probe (Phase 1) |
| NFR-7 | Concurrent editors per project (no data loss) | ≥ 10 — **Postgres deployments only** | k6 multi-user load test (Phase 3a); SQLite is single-user-local and exempt |
| NFR-8 | Public repo hygiene | Zero secrets in history | gitleaks pre-commit + pre-push + CI; two-person publication |
| NFR-9 | Accessibility | WCAG 2.1 AA on board + editors + dashboards + modals | axe-core per-component test (Phase 1 onward); not deferred to Phase 4 |
| NFR-10 | Auditability | Every mutating canonical- artifact API call emits an immutable audit record | Audit-emission contract test on every mutating endpoint (Phase 0) |
| NFR-11 | Threat-model coverage | Every internet-facing surface has a documented threat model | Threat-model doc reviewed at Phase 0 gate |

## Decisions recorded here (resolved in Round 2 of verifier loop)

- **D-SidecarLoc**: Dashboard metadata lives under `openspec/.dashboard/` (server-owned,
  validate-excluded). Erasure purges ONLY this subtree; canonical artifacts are untouched.
- **D-MainSpecCRUD**: Direct mutation of `openspec/specs/*` via the dashboard is FORBIDDEN.
  Main specs mutate ONLY through a change + archive. Req 02 §2.3/§2.4 are **read + propose
  via change** surfaces, not direct CRUD.
- **D-TaskID**: Task IDs are UUIDs assigned in the sidecar at first-seen. Markdown numbers
  are display-only and never persisted as the identity.
- **D-Roundtrip**: See INV-2 + Authority contract above.
- **D-Concurrency**: Per-section ETags (INV-7), not file-level.
- **D-Security**: Threat model required (NFR-11); see req 08 §8.10, req 09 §9.10.
- **D-Auth**: Better-Auth (Lucia is deprecated — out).
- **D-BullMQ**: Dropped from MVP. Redis added only when a real async job exists.
- **D-Verify**: §6.1 is **heuristic checks inspired by `/opsx:verify`**, not parity. An
  optional LLM-augmented tier is a Phase 3 enhancement.
- **D-NFR5**: Downgraded to "documented rules" with a gap registry; upstream-source
  retrieval is an explicit Phase 0 task.
