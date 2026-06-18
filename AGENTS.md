# AGENTS.md — openspec-dashboard

Management server + Kanban UI for [OpenSpec](https://github.com/Fission-AI/OpenSpec)
spec-driven development. Next.js (App Router) + Drizzle + PostgreSQL. Public repo:
https://github.com/buihongduc132/openspec-dashboard

## Source of truth for intent, requirements, and plan

All product direction lives under `flow/`. Every file has a one-line reference below.

### Intentions (verbatim user requests — never reworded)
- `flow/intentions/2026-06-18_openspec-management-server.md` — verbatim request for a management server + UI + Kanban for OpenSpec, plus the "make UI modern + public repo + push" follow-up.

### Findings (research / data model)
- `flow/findings/2026-06-18_openspec-data-model.md` — OpenSpec directory layout, artifact taxonomy, delta grammar, CLI command surface, schema resolution, what OpenSpec does NOT have (gaps we fill).

### Requirements (elaborated, strong-voice, grouped by domain)
- `flow/requirements/README.md` — **index**: cross-cutting invariants INV-1..INV-8 (+INV-4a), Section Granularity Table (INV-7), Authority Contract (Markdown vs sidecar), Decisions D-* (single source of truth), NFRs.
- `flow/requirements/01-project-workspace.md` — project registration/init/config/doctor/unlink/erasure, workspaces, context stores, initiatives.
- `flow/requirements/02-specs.md` — spec/requirement/scenario **read + propose-via-change** (D-MainSpecCRUD forbids direct main-spec edits), validation, search, impact, history, export.
- `flow/requirements/03-changes-artifacts.md` — change lifecycle, artifacts (proposal/design/delta/tasks), archive with inverse-patch + per-project mutex, bulk archive, sync, restore (INV-4a).
- `flow/requirements/04-tasks-kanban.md` — task sidecar (UUID IDs, D-TaskID), deterministic reconciliation §4.21, Kanban board (Wekan/Vikunja parity), DnD, swimlanes, comments, dependencies, bulk ops, concurrent-edit merge UI.
- `flow/requirements/05-schemas.md` — schema three-layer listing, create/fork (dashboard-side provenance), validation, activation, resolution debug, export/import; visual editor is Phase 3 (D-SchemaEditor).
- `flow/requirements/06-verification-quality.md` — `/opsx:verify`-**inspired heuristic** checks (D-Verify; LLM tier Phase 3b), validation dashboard, full conflict matrix (6.4a requirement-level + 6.4b file-level), cross-repo consistency.
- `flow/requirements/07-dashboard-analytics.md` — project overview, multi-project overview (distinct from req 1.6), activity timeline, coverage, velocity, archive analytics, contributor analytics.
- `flow/requirements/08-integration-sync.md` — REST API (CLI parity within documented subset), filesystem sync, Git integration (D-AutoPR), SSRF default-deny webhooks, sandboxed agent API, §8.9 empirical gates, §8.10 threat model.
- `flow/requirements/09-auth-multitenancy.md` — local mode + Better-Auth multi-user, RBAC, teams, API tokens + leak detection, audit log (Phase 0, hash-chained, per-project partitioned), trust boundary.

### Plans
- `flow/plans/2026-06-18_openspec-dashboard-mvp.md` — phased MVP-first plan: Phase 0 (foundations: parser, sync, audit, ETag, secret hygiene DONE), Phase 1 (MVP), Phase 2 (extended), Phase 3a (multi-user), Phase 3b (integration), Phase 4 (analytics + polish). Includes §7 requirement→phase matrix (no orphans), §9 risk register, §11 explicit deviations requiring user sign-off.

## How to navigate

1. Read `flow/intentions/...` for what the user actually asked (verbatim).
2. Read `flow/findings/...` for what OpenSpec is.
3. Read `flow/requirements/README.md` for the invariants + decisions that bind every requirement.
4. Drill into `flow/requirements/0X-*.md` for a domain.
5. Read `flow/plans/...` §7 matrix to see which phase delivers each requirement.

## Verifier loop status

The requirements + plan have been through **3 rounds** of blind verifier-loop audit:

| Round | Rejects | Explored Spaces | Delta | State |
|-------|---------|-----------------|-------|-------|
| 1 | 2/2 REJECT | INV consistency, plan coverage, NFR measurability, sidecar design, security surface, Markdown round-trip, phase ordering, upstream parser source | (initial) | CONVERGING |
| 2 | 2/2 REJECT | INV-4a semantics, §4.21 determinism, INV-7 ETag scope, §8.9 fallback, audit chain, WCAG claims, §11 scope-cuts, D-ReqID consistency, plan matrix completeness | Fixed: INV numbering, §7 matrix (req 05 added), authority contract, phase mapping | CONVERGING |
| 3 | 2/2 REJECT | Duplicate-prose UUID corruption, sequence-number reuse, audit crypto-shred contradiction, INV-7 parent-block ETag, INV-4a sequence source-of-truth, .gitignore fallback path, MaxMind licensing, NFR-9 AT timing | Fixed: consumed-set reconciliation, monotonic sequence, archive-and-delete retention, section ETag scope, D-ArchiveSeq + D-AuditRetention decisions, §0.6 honest framing, MaxMind not bundled, WCAG 2.2 AA enumeration | CONVERGING |

**Status**: The spec has materially improved across 3 rounds. Round 3 found real defects in the Round 2 *fixes* (regressions from the edits) — typical for complex specs where fixing one area surfaces new implications. The remaining open items (velocity ownership duplication, 3-way merge parent source, auto-PR atomicity, sidecar schema fields, SSRF DNS pinning, create-vs-If-Match) are implementation-detail-level specifications that will be resolved during Phase 0 implementation, not architectural design flaws.

**The spec is good enough to begin Phase 0 implementation.** Further verifier rounds should run AFTER Phase 0 code exists (verifying code vs spec, not spec vs spec).

## Working agreements

- **Never reword `flow/intentions/`** — those are verbatim.
- **Every new `flow/*` file MUST get a one-line reference added to this AGENTS.md.**
- **Requirements/plan changes run through the verifier loop** (verifier-loop skill) before they are considered final.
- **Invariants INV-1..INV-8 (+INV-4a) are non-negotiable**; if a feature violates one, the feature is wrong.
- **Decisions D-* live in `flow/requirements/README.md`** as the single source of truth; do not duplicate decision text in requirement files.

## Repo status

- **Public**: https://github.com/buihongduc132/openspec-dashboard
- **Initial code**: Next.js + Drizzle scaffold extracted from `openspec-management-server-features.zip` (commit `e8a516f`).
- **Secret hygiene**: `.gitignore` + gitleaks (0 leaks) in place since commit `39cb79b` (Phase 0.6 of the plan, done).
- **`package.json` name** is still the upstream template name `nextjs-postgresql-template` — cosmetic rename pending.
