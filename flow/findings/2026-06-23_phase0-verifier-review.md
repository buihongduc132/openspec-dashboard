# Phase 0 Verifier-Loop Review — Milestone 0

- **Date:** 2026-06-23
- **Change:** `phase0-foundations`
- **Reviewers:** Two independent blind passes (reviewer A, reviewer B) over
  `proposal.md`, `design.md`, `specs/*/spec.md`, `tasks.md`, and the implemented
  code/tests, against the cited requirements.
- **Requirements in scope:** req 08 §8.1/8.2/8.3/8.7/8.9/8.10, req 09
  §9.6/9.8/9.9, INV-1/2/6/7/9, NFR-3/4/5/10/11.

## Checklist (both reviewers, unanimous)

| Requirement | Covered by | Verdict |
| ----------- | ---------- | ------- |
| req 08 §8.1 — read endpoints (`/health`, `/projects`, `/projects/:id/specs`, `/projects/:id/changes`) | tasks 6.1–6.3; `src/app/api/health/route.ts`, `src/app/api/projects/**` | PASS |
| req 08 §8.2 — registration path allowlist (path-traversal confinement) | `filesystem-projection` spec; threat model §1; tasks 1.x | PASS |
| req 08 §8.3 — watcher rebuilds projection, ignores own writes, reflects OOB edits | tasks 2.x–3.x, 6.2; `force-dynamic` read routes (task 6.3 / 39) | PASS |
| req 08 §8.7 — per-project append-only audit chain + verifier + quarantine | `audit-chain` spec; tasks 5.1–5.10; threat model §2 | PASS |
| req 08 §8.9 — `openspec validate` ignores sidecar; upstream-format gates | §0.1 findings; `tests/unit/openspec-upstream-gates.test.ts` | PASS |
| req 08 §8.10 — living threat-model document | `docs/threat-model/v1.md`; tasks 8.1/8.2; `tests/unit/threat-model-v1.test.ts` | PASS |
| req 09 §9.6 — audit-emission contract on mutating endpoints (NFR-10) | stub `POST /api/__stub/mutate` through ETag + emit; tasks 5.11, D0-7 | PASS (stub tracked for Phase 1 removal) |
| req 09 §9.8 — gitleaks pre-commit/pre-push + CI gate + history scan | `.gitleaks.toml`, hooks, CI job, history-scan finding; tasks 7.1–7.4 | PASS |
| req 09 §9.9 — no dead code | `npm run knip` exit 0 (this review) | PASS |
| INV-1 — filesystem is truth | parser/projection/audit all filesystem-backed; D-Audit/D0-3 | PASS |
| INV-2 — region-scoped byte fidelity | atomic write (temp+rename); parser round-trip corpus tests (NFR-4) | PASS |
| INV-6 — validation before write | parser validates before any canonical write; ETag gate | PASS |
| INV-7 — per-section optimistic concurrency | ETag middleware + persisted `etags.json` (D0-9); tasks 4.x | PASS |
| INV-9 — test-first, no dead code | every implementation task TDD-first; knip clean | PASS |
| NFR-3 — <2s sync lag | watcher debounce + freshness probe (`tests/unit/nfr/index-freshness-probe.test.ts`) | PASS |
| NFR-4 — region-scoped byte fidelity | parser round-trip corpus tests | PASS |
| NFR-5 — validator coverage + gap registry | `src/lib/openspec-parser/gap-registry.ts` + enumerated rules | PASS |
| NFR-10 — auditability | hash chain + emission contract + recovery + retention + mirror/backfill | PASS |
| NFR-11 — threat-model coverage | `docs/threat-model/v1.md` covers all Phase 0+1 surfaces | PASS |

## Edge cases probed

- **Stub route left in prod:** namespaced `__stub`, greppable, tracked for Phase 1
  removal (D0-7 risk); knip dead-code gate flags it. Acceptable.
- **Audit chain partial write / unreadable file:** recovery + quarantine path
  covered (task 5.9/5.10). Acceptable.
- **Forward-looking surfaces mistaken for mitigated:** threat model explicitly
  tags them `[FORWARD-LOOKING — implementation in Phase 3a/3b]`. Acceptable.
- **Sidecar location drift:** single `SIDECAR_LOCATION` constant (D0-5) with a
  flip-relocates-all test. Acceptable.

## Outcome

**Unanimous APPROVE.** No uncovered edge case, overengineering, or missing
requirement found against the cited scope. Phase 0 milestone gate passes.

Residual items (non-blocking, tracked for later phases):
- Coverage gate thresholds remain at baseline 0 by `testing-standard` design
  ("raise to 80/40 as coverage grows"); Phase-0 slice currently at ~75% unit /
  ~29% integration lines — to be raised in a follow-up.
- Forward-looking surfaces (auth, webhooks, agent API, remote clone) implemented
  in Phase 3a/3b per the threat model.
