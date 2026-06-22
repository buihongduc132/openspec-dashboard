<!-- Progress snapshot as of commit e38f266 (2026-06-18).
     Checked items = verified present in src/ via grep/build.
     Unchecked items = per flow/plans/2026-06-18_openspec-dashboard-mvp.md.
     Source of truth for spec semantics: flow/requirements/01..09 + README.md. -->

## 1. Foundations (Phase 0)

- [x] 1.1 Initialize Next.js 16 + React 19 + Drizzle + PostgreSQL scaffold
- [x] 1.2 Define DB schema (18 tables: projects, specs, requirements, scenarios, changes, artifacts, deltaSpecs, tasks, taskComments, schemas, schemaArtifacts, workspaces, workspaceLinks, contextStores, initiatives, verificationReports, auditLogs, specDomains)
- [x] 1.3 Seed data matching the 18-table schema (396 lines)
- [x] 1.4 `.gitignore` + `.env.example` committed; `.openspec-dashboard/` fallback pre-ignored
- [x] 1.5 Public repo created + pushed (https://github.com/buihongduc132/openspec-dashboard)
- [x] 1.6 Health endpoint (`GET /api/health`)
- [x] 1.7 OpenSpec parser port — documented upstream rules + gap registry (req 08 §8.9)
- [x] 1.8 Filesystem projection (Markdown ↔ in-memory) + atomic writes (req 01 §1.4)
- [ ] 1.9 Per-section ETag implementation (INV-7, Section Granularity Table)
- [ ] 1.10 Audit log hash-chain + chain verifier (NFR-10, D-ArchiveSeq)
- [ ] 1.11 OpenAPI skeleton + read endpoints (req 08 §8.1)
- [ ] 1.12 Pre-commit + pre-push gitleaks hooks + CI gitleaks gate (Phase 0.6, currently PENDING)
- [ ] 1.13 Initial-push history scan (retroactive gitleaks on `e8a516f` + `39cb79b`)
- [ ] 1.14 Threat model v1 (NFR-11)
- [ ] 1.15 Fix Dependabot moderate vuln + `npm audit` 6 moderates

## 2. MVP UI + read paths (Phase 1)

- [x] 2.1 shadcn/ui component library (avatar, badge, button, card, input, progress, separator)
- [x] 2.2 App sidebar + theme provider + dark/light toggle
- [x] 2.3 Dashboard home (`/`) with real DB stats
- [x] 2.4 Projects list (`/projects`) + new-project form (POST `/api/projects`)
- [x] 2.5 Project detail (`/projects/[id]`) with real DB reads
- [x] 2.6 Project settings (`/projects/[id]/settings`) with API-backed form (PATCH `/api/projects/[id]`)
- [x] 2.7 Specs list + spec-domain detail pages (read-only, propose-via-change CTA stub)
- [x] 2.8 Changes list + change detail pages (read-only)
- [x] 2.9 Schema list page (read-only)
- [x] 2.10 Kanban board pages (project-scoped + global) with DnD client component
- [x] 2.11 Task PATCH endpoint (`PATCH /api/tasks/[id]`) wired to kanban DnD
- [x] 2.12 Context stores page + workspaces page (read-only shells)
- [x] 2.13 `next build` + `tsc --noEmit` clean (21 routes)
- [ ] 2.14 Spec module — propose-via-change flow (req 02)
- [ ] 2.15 Spec validate + FTS5 search + spec impact analysis (req 02.8)
- [ ] 2.16 Change module — proposal/design/delta/task editors (req 03.1–3.10)
- [ ] 2.17 Change single-archive with inverse-patch + per-project mutex (req 03.13, INV-4/4a)
- [ ] 2.18 Task sidecar JSON (`openspec/.dashboard/tasks/<change>.json`) + migrator
- [ ] 2.19 Deterministic reconciliation algorithm (§4.21, consumed-set + UUID tie-break)
- [ ] 2.20 Concurrent-edit 3-way merge UI (INV-7)
- [ ] 2.21 Schema validate + resolution debug (req 05.1, 05.2, 05.7, 05.9)
- [ ] 2.22 Dashboard activity timeline (req 7.3) + velocity chart (req 7.5)

## 3. NFR measurement plumbing (Phase 1.6)

- [ ] 3.1 Lighthouse CI gate (NFR-1)
- [ ] 3.2 k6 read-latency load test (NFR-2)
- [ ] 3.3 Index-freshness probe (NFR-6)
- [ ] 3.4 axe-core per-component a11y tests + manual AT for DnD (NFR-9, WCAG 2.1 AA + 2.2 AA)

## 4. Extended (Phase 2)

- [ ] 4.1 Task richness — swimlanes, filters, search, deps, assignments, labels, comments, sub-checklists, due dates, list/calendar views, progress, bulk ops, real-time (req 04.7–4.10, 4.12–4.20, 4.23)
- [ ] 4.2 Change richness — artifact dependency graph, custom artifacts, bulk archive, change sync no-archive, archive browsing + restore (req 03.11, 03.12, 03.14–03.16)
- [ ] 4.3 File-level conflict detection (req 06.4b)
- [ ] 4.4 Spec richness — version history/blame, export (req 02.6, 02.9)
- [ ] 4.5 Schema authoring — create/fork, templates, activation, export/import (req 05.3, 05.4, 05.6, 05.8, 05.10)
- [ ] 4.6 Heuristic verifier + project-wide validation + validation dashboard (req 06.1, 06.2, 06.3)

## 5. Multi-user + RBAC (Phase 3a)

- [ ] 5.1 Better-Auth integration (req 09.1–09.4, 09.7)
- [ ] 5.2 RBAC + permissions enforcement
- [ ] 5.3 Workspaces write flows (req 01.7)
- [ ] 5.4 Context stores write flows (req 01.8)
- [ ] 5.5 Initiatives coordination

## 6. Integration (Phase 3b)

- [ ] 6.1 Teams + API tokens + leak detection + trust boundary (req 09.5, 09.10)
- [ ] 6.2 Git integration — clone, sync, branch ops (req 08.4)
- [ ] 6.3 Webhooks + agent API (req 08.5, 08.6)
- [ ] 6.4 LLM verifier tier (req 06.1d)
- [ ] 6.5 Visual schema editor (req 05.5 per D-SchemaEditor)

## 7. Analytics + polish + release (Phase 4)

- [ ] 7.1 Analytics dashboards (req 07.2, 07.4, 07.6, 07.7)
- [x] 7.2 UI modernization pass (done ahead of schedule via v3 merge)
- [ ] 7.3 Docs + demo + contribution guide
- [ ] 7.4 Public repo publication gate wired (req 09.8, two-person + secret-scan)

## 8. OpenSpec dogfooding (this change)

- [x] 8.1 `openspec init --tools pi` run
- [x] 8.2 Change `build-openspec-dashboard-mvp` created
- [x] 8.3 proposal.md written
- [x] 8.4 tasks.md written with progress checked against `e38f266`
- [x] 8.5 Delta specs written (project-workspace, dashboard-foundation, tasks-kanban)
- [x] 8.6 `openspec validate build-openspec-dashboard-mvp` passes
