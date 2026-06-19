## Why

The dashboard's codebase is growing through multiple phased proposals. Without a binding test discipline, coverage drifts, dead code accumulates, and regressions slip between phases. This change establishes the single, project-wide testing standard — TDD-first with hard coverage gates — that **every other change inherits and must satisfy**. It exists to be cited by all phase proposals so the rule is stated once, not re-argued per change.

## What Changes

- Codify **TDD as the only acceptable development approach**: tests written first (red → green → refactor); no production code merges without a failing test that drove it.
- Enforce two coverage gates in CI: **unit/TDD line coverage > 80%** and **integration-test line coverage > 40%**. Integration runs MUST instrument line coverage ON (measured, not estimated) to verify the gate.
- Add a **dead-code gate**: uncovered, unreferenced, or commented-out production code is removed before merge — never left in. A dead-code detector runs in CI.
- Wire the tooling for this repo's stack: coverage via `c8`/`nyc` (Node) with the Next.js/React test runner, dead-code detection via `knip`/`ts-prune` (TypeScript).
- Each phase proposal (Phase 0–4) cites this standard and its tasks include test-writing steps; the per-phase verifier-loop gate checks the coverage numbers + dead-code absence before approval.
- This is recorded as invariant **INV-9**, decision **D-TDD**, and **NFR-12** in `flow/requirements/README.md` (already applied).

## Capabilities

### New Capabilities
- `testing-standard`: The project-wide TDD discipline, coverage gates (unit > 80%, integration > 40% with line coverage ON), dead-code prohibition, and the CI tooling that enforces them. Imported by every other capability's test plan.

### Modified Capabilities
<!-- None — this is the first cross-cutting standard; existing phase specs will reference it. -->

## Impact

- **Code**: New CI workflow files (coverage gate + dead-code gate jobs); `c8`/`nyc` config; `knip`/`ts-prune` config; a test-runner setup if one is not already present. No production code changes beyond removing any dead code the gate first flags.
- **APIs**: None.
- **Dependencies**: Adds dev-only test + coverage + dead-code tooling (`c8` or `nyc`, `knip` or `ts-prune`, plus the chosen test framework if absent).
- **Data**: None.
- **Docs**: `flow/requirements/README.md` already updated (INV-9, D-TDD, NFR-12). AGENTS.md gains a one-line pointer to this standard so every AI agent working on the repo sees it.
- **Systems**: CI runs longer (coverage instrumentation + dead-code scan); acceptable.
