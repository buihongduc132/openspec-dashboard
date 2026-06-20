# PHASE SCOPES (appended to each comrade's brief)

---

## Phase 0 scope (comrade: phase0-worker)
**Change name**: `phase0-foundations`
**Plan section**: `flow/plans/2026-06-18_openspec-dashboard-mvp.md` §1 (Phase 0 — Foundations)
**Requirements owned** (from §7 matrix): req 08 §8.1 (OpenAPI skeleton, Phase 0.5 + rolling), 08 §8.2 (filesystem projection, Phase 0.3), 08 §8.3 (ETag infra, Phase 0.3), 08 §8.7 (audit-emission contract, Phase 0.3), 08 §8.9 (upstream-format empirical gates, Phase 0.1), 08 §8.10 (threat model, Phase 0.7), 09 §9.6 (audit log + chain, Phase 0.4), 09 §9.8 (secret hygiene Phase 0.6 — note: .gitignore DONE, gitleaks hooks pending), 09 §9.9 (sidecar location Phase 0.3).
**Deliverables**: OpenSpec parser port (documented rules + gap registry per NFR-5), filesystem projection + atomic writes + per-section ETag (INV-7), audit log + hash-chain verifier (NFR-10), OpenAPI skeleton + health + read endpoints, secret hygiene (gitleaks hooks + history scan), threat model v1 (NFR-11), verifier-loop milestone 0.
**Capabilities to create** (NEW): `openspec-parser`, `filesystem-projection`, `audit-chain`, `api-foundation`. (These are the `dashboard-foundation` mega-capability split into testable pieces — OR keep as one `dashboard-foundation` if the mega-proposal already specced it; check `openspec/changes/build-openspec-dashboard-mvp/specs/dashboard-foundation/spec.md` and refine/split it for Phase 0 scope only.)
**Invariants heavy in this phase**: INV-1 (filesystem truth), INV-2 (byte fidelity), INV-6 (validate before write), INV-7 (ETag), INV-9 (TDD).
**Must cite**: `testing-standard` (tooling from `tdd-coverage-standard` lands here or alongside).

---

## Phase 1 scope (comrade: phase1-worker)
**Change name**: `phase1-mvp`
**Plan section**: §2 (Phase 1 — MVP)
**Requirements owned**: 01 §1.3–1.6 (project config/init/dashboard), 02 §2.1–2.5, 2.7, 2.8 (spec read + propose + impact), 03 §3.1–3.10, 3.13 (change lifecycle + single archive), 04 §4.1–4.6, 4.11, 4.21, 4.22, 4.24 (task sidecar + kanban + reconciliation), 05 §5.1, 5.2, 5.7, 5.9 (schema read + validate), 06 §6.4a (requirement-level conflict only), 07 §7.1, 7.3, 7.5 (overview + activity + velocity), 08 §8.4 (git — Phase 3b, NOT here).
**Deliverables**: spec module (read + propose-via-change + impact + 6.4a conflict), change module (lifecycle + single-archive inverse-patch INV-4/INV-4a), task sidecar + kanban DnD (UUID IDs D-TaskID, deterministic reconcile §4.21), schema module (read + validate + resolution debug), dashboard overview + activity timeline + velocity, NFR measurement plumbing (Lighthouse NFR-1, k6 NFR-2, axe NFR-9 incl. DnD manual AT).
**Capabilities to create** (NEW, refining the mega-proposal's declarations): `specs-module`, `changes-module`, `tasks-kanban` (check existing spec at `openspec/changes/build-openspec-dashboard-mvp/specs/tasks-kanban/spec.md` — refine for Phase 1 scope), `schemas-module-read`, `dashboard-overview`. Do NOT include Phase 2 richness.
**Invariants heavy**: INV-3 (CLI parity), INV-4/4a (archive restorable), INV-5 (sidecar), INV-7 (ETag), INV-8 (search), INV-9 (TDD).
**Gate**: usable single-project tool, no auth.

---

## Phase 2 scope (comrade: phase2-worker)
**Change name**: `phase2-extended`
**Plan section**: §3 (Phase 2 — Extended)
**Requirements owned**: 01 §1.1, 1.2 (project registration — wait, check: 1.1 is Phase 0.3/3a, 1.2 Phase 0.5; verify against matrix), 02 §2.6, 2.9 (spec history/export), 03 §3.11, 3.12, 3.14–3.16 (artifact graph, custom artifacts, bulk archive, change sync, restore browsing), 04 §4.7–4.10, 4.12–4.20, 4.23 (task richness: swimlanes, deps, comments, sub-checks, bulk ops, concurrent-merge UI), 05 §5.3, 5.4, 5.6, 5.8, 5.10 (schema authoring — NOT 5.5 visual editor), 06 §6.1 heuristic, 6.2, 6.3, 6.4b (file-level conflict).
**Deliverables**: Wekan/Vikunja parity within a project — task swimlanes/dependencies/comments/sub-checklists/bulk-ops/concurrent-merge UI; change artifact dependency graph + custom artifacts + bulk archive (full conflict matrix incl. file-level 6.4b) + archive browsing/restore (INV-4a unrestorable); spec version history/export; schema authoring (create/fork/validate/activate, raw YAML editor only — visual editor is Phase 3b per D-SchemaEditor); heuristic verification tier (D-Verify).
**Capabilities to create** (NEW): `tasks-kanban-rich`, `changes-archive-rich`, `specs-history`, `schemas-authoring`, `verification-heuristic`.
**Gate**: Wekan/Vikunja parity.

---

## Phase 3a scope (comrade: phase3a-worker)
**Change name**: `phase3a-auth-multitenancy`
**Plan section**: §4 (Phase 3a — Multi-user + RBAC)
**Requirements owned**: 01 §1.7, 1.8, 1.9 (workspaces, context stores, initiatives), 05 §5.5 is Phase 3b NOT here, 06 §6.5 (Phase 3a), 09 §9.1–9.4, 9.7 (auth + RBAC + roles), 09 §9.9 full erasure (Phase 0 did location, 3a does full right-to-erasure per D-AuditRetention).
**Deliverables**: Better-Auth integration (D-Auth — Lucia deprecated, out), RBAC (role definitions, permission checks), teams scoping, workspaces + context stores + initiatives full implementation, audit right-to-erasure (archive-and-delete per D-AuditRetention).
**Capabilities to create** (NEW): `authentication`, `rbac`, `workspaces`, `audit-erasure`.
**Heavy**: INV-9 (TDD), NFR-7 (≥10 concurrent editors — Postgres only, k6 multi-user load test here), NFR-9 (a11y on auth flows). Threat model updated for auth surfaces.

---

## Phase 3b scope (comrade: phase3b-worker)
**Change name**: `phase3b-integration`
**Plan section**: §5 (Phase 3b — Integration)
**Requirements owned**: 05 §5.5 (visual schema editor — D-SchemaEditor), 06 §6.1d (LLM verifier tier), 08 §8.4 (git integration D-AutoPR), 08 §8.5 (webhooks, SSRF default-deny), 08 §8.6 (sandboxed agent API), 09 §9.5 (API tokens + leak detection), 09 §9.10 (trust boundary matrix).
**Deliverables**: teams + scoped API tokens (glob allowlist, rate limits, leak detection), git integration (auto-PR on archive REQUIRES autoPush per D-AutoPR), webhooks (SSRF default-deny egress), sandboxed agent JSON API, LLM-augmented verifier tier, visual schema form builder.
**Capabilities to create** (NEW): `api-tokens`, `git-integration`, `webhooks`, `agent-api`, `llm-verifier`, `schema-visual-editor`.
**Heavy**: threat model (req 08 §8.10) updated for all external surfaces; SSRF DNS pinning; trust boundary matrix.

---

## Phase 4 scope (comrade: phase4-worker)
**Change name**: `phase4-analytics-polish`
**Plan section**: §6 (Phase 4 — Analytics + polish + open-source)
**Requirements owned**: 07 §7.2, 7.4, 7.6, 7.7 (multi-project overview DISTINCT from req 1.6, coverage, archive analytics, contributor analytics), 08 §8.8 (Phase 4 item — verify what 8.8 is).
**Deliverables**: analytics dashboards (multi-project overview, coverage, archive analytics, contributor analytics — velocity 7.5 already in Phase 1.5), UI modernization pass, docs + demo + contribution guide, public repo publication gate (two-person manual, secret-scanned — req 09 §9.8 Phase 4.4 gate governs subsequent sensitive releases).
**Capabilities to create** (NEW): `analytics-multi-project`, `analytics-coverage`, `analytics-contributors`, `docs-release`.
**Note**: The repo is ALREADY public (deviation owned in plan §6.4.4) — Phase 4.4 governs subsequent releases, not the initial push. Do not re-litigate.
