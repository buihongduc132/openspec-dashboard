## Why

This repository IS the OpenSpec management dashboard — a server/UI layer on top of
the OpenSpec CLI spec-driven-development workflow. It needs to track its own
development progress using OpenSpec itself (dogfooding). This change captures the
end-to-end MVP build from foundations through a usable single-project tool, with
tasks checked against the actual state of the codebase as of commit `e38f266`.

The full requirements live in `flow/requirements/01..09` (9 domains) and the
phased plan in `flow/plans/2026-06-18_openspec-dashboard-mvp.md`. This OpenSpec
change mirrors that plan into OpenSpec's change/tasks workflow so progress is
visible to `openspec list` / `openspec status` and any AI agent using the
OpenSpec skills.

## What Changes

Build the dashboard in phases (matching `flow/plans/§0..§4`):

- **Phase 0 — Foundations**: OpenSpec parser port, filesystem projection,
  per-section ETag, audit hash-chain, OpenAPI skeleton, secret hygiene,
  threat model.
- **Phase 1 — MVP**: spec/change/task/schema/dashboard modules with real
  read + propose + validate flows; kanban with sidecar task store;
  NFR measurement plumbing (Lighthouse/k6/axe).
- **Phase 2 — Extended**: task richness (swimlanes, deps, comments),
  change richness (artifact graph, bulk archive), schema authoring,
  heuristic verifier.
- **Phase 3a — Multi-user**: Better-Auth, RBAC, workspaces, context stores.
- **Phase 3b — Integration**: teams, git, webhooks, agent API, LLM verifier,
  visual schema editor.
- **Phase 4 — Analytics + polish**: analytics dashboards, UI pass, docs.

## Capabilities

### New Capabilities

- `dashboard-foundation`: OpenSpec parser, filesystem projection, ETag,
  audit chain, OpenAPI — the engine everything else hangs on (req 08 §8.9,
  plan §0).
- `project-workspace`: project registration, sandboxed clone, config editor
  (req 01).
- `specs-module`: spec list/detail/validate/search + propose-via-change +
  impact analysis (req 02).
- `changes-module`: change lifecycle — proposal/design/delta/task editors,
  single-archive with inverse-patch (req 03).
- `tasks-kanban`: UUID task IDs, sidecar JSON store, deterministic
  reconciliation, kanban DnD board, merge UI (req 04).
- `schemas-module`: schema list/detail/validate/resolution-debug; authoring
  in Phase 2; visual editor in Phase 3 (req 05).
- `verification`: conflict matrix (6.4a requirement-level, 6.4b file-level),
  heuristic + LLM verifier tiers (req 06).
- `dashboard-analytics`: project overview, activity timeline, velocity,
  analytics (req 07).
- `integration-sync`: git, webhooks, agent API, SSRF guard (req 08).
- `auth-multitenancy`: Better-Auth, RBAC, API tokens, leak detection,
  audit retention, trust boundary (req 09).

### Modified Capabilities

_(none — greenfield repo, no existing main specs yet)_

## Impact

- **Code**: `src/` (Next.js App Router), `src/db/schema.ts` (18 tables
  already defined), `src/app/api/*` (4 routes already defined).
- **New subsystems**: parser, projection, audit chain, auth, git sync.
- **Dependencies to add**: better-auth, dnd-kit (or react-dnd fallback),
  zod (validation), argon2id, nanoid/uuid, marked or remark-gfm.
- **External**: PostgreSQL (Drizzle), optional Geo-IP source (Phase 3b).
- **Public repo**: https://github.com/buihongduc132/openspec-dashboard —
  secret hygiene gates apply before any auth/key work (Phase 0.6).
