## Context

The dashboard codebase is Next.js 16 (App Router) + Drizzle + Postgres + React 19 + Tailwind 4. No test framework, coverage tool, or dead-code detector is currently wired. The repo has `npm run build` / `typecheck` / `lint` but no `test` script. Every phase proposal from here on adds code, so the testing standard must land before (or alongside) Phase 0 so all subsequent work is born under it.

## Goals / Non-Goals

**Goals:**
- One `npm run test` + `npm run test:integration` that CI gates on.
- Hard coverage gates: unit > 80% line, integration > 40% line (instrumentation ON during integration, measured).
- Dead-code detector in CI that fails on unreferenced/commented-out production code.
- A standard that every phase proposal cites by reference, not by restating.

**Non-Goals:**
- Achieving 80%/40% coverage retroactively on the already-merged scaffolding — the gate applies forward to code added under each phase; pre-existing code is tracked but not blocked retroactively (it gets fixed phase-by-phase).
- Property-based testing, mutation testing, or fuzzing frameworks (future enhancements, not this change).
- E2E browser testing (Playwright) — separate concern; integration here means API/route/component-integration tests against a real or in-memory DB.
- Flaky-test quarantine system (YAGNI until we have a flake).

## Decisions

### D-T1: Vitest as the single test runner
**Decision:** Use **Vitest** for both unit and integration tests. Unit tests live next to source (`*.test.ts`/`*.test.tsx`); integration tests live under `tests/integration/`. Coverage via Vitest's built-in `v8` provider.

**Why:** Vitest is native to the Vite/React ecosystem, runs fast, has first-class coverage via `@vitest/coverage-v8`, and shares config with the existing TS/Vite toolchain. One runner = one config = no boundary ambiguity between "unit" and "integration".

**Alternatives:** Jest (slower, more config for ESM/TSX), Node test runner (no built-in coverage/DOM). Vitest wins on integration cost.

### D-T2: Two test projects in one Vitest config
**Decision:** One `vitest.config.ts` defining two `projects` (unit, integration), each with its own coverage threshold (`coverage.thresholds.lines: 80` for unit, `40` for integration). Run separately in CI so the two coverage numbers are reported and gated independently.

**Why:** Keeps a single tool but enforces the two distinct thresholds. Running separately means integration coverage is measured on the integration run alone (instrumentation ON), not blended with unit.

**Alternatives:** Two separate Vitest configs (more drift), one blended number (hides whether integration specifically meets 40%).

### D-T3: Integration tests hit a real Postgres via testcontainers
**Decision:** Integration tests use **testcontainers** to spin a disposable Postgres per run, run Drizzle migrations, and exercise real API routes via `next/test` route handlers or supertest-style calls. Line coverage is collected across the run.

**Why:** The dashboard's correctness hinges on Drizzle/Postgres behavior and route handlers; mocking the DB defeats the purpose of integration testing. Testcontainers gives isolation without a persistent test DB. Coverage ON during the run is required by the spec.

**Alternatives:** SQLite swap (different SQL dialects → false confidence), a shared persistent test DB (flaky, state leaks).

### D-T4: knip for dead-code detection
**Decision:** Use **knip** in CI to detect unreferenced exports, unused files, and unused dependencies. A separate lint script flags commented-out code blocks via a custom rule (eslint `no-commented-out-code` equivalent or a small script).

**Why:** knip is purpose-built for TS/JSX dead-code, handles Next.js App Router entry points, and is fast. Commented-out-code detection via ESLint rule keeps it in the existing lint flow.

**Alternatives:** ts-prune (less maintained, weaker on App Router), manual review (not enforceable).

### D-T5: Coverage gate is a CI gate, not a pre-commit hook
**Decision:** Coverage + dead-code checks run as required CI jobs, not pre-commit hooks. Developers can run them locally (`npm run test:coverage`, `npm run knip`) but the gate is enforced server-side on PRs.

**Why:** Pre-commit coverage hooks slow the inner loop and punish partial work. The gate belongs at PR/merge time. Local commands exist for self-check.

**Alternatives:** Pre-commit (rejected — friction), only-on-merge-to-main (rejected — too late, harder to fix).

### D-T6: Forward-only coverage, phase-tagged
**Decision:** Coverage is measured on the whole production tree, but the gate is enforced on the **delta added by each phase** using coverage diff tooling (e.g. `c8`/Vitest diff or a per-phase coverage baseline). Pre-existing uncovered code does not block, but each phase must keep its own additions above threshold.

**Why:** The scaffolding already shipped without tests; retroactively demanding 80% on it blocks all forward progress. The honest contract is: each new phase's code meets the standard; old code is cleaned up incrementally.

**Alternatives:** Strict whole-repo gate immediately (blocks everything), no phase tagging (hides regressions). Phase-tagged is the pragmatic middle.

## Risks / Trade-offs

- **[Testcontainers startup time]** Spinning Postgres per CI run adds ~10-30s. → Acceptable for integration suite run a few times per PR; unit suite stays fast and runs on every push.
- **[Coverage gaming]** Devs can write shallow tests to hit 80% line coverage without real assertions. → Reviewer + verifier-loop checks assertion quality, not just the number; dead-code gate catches unreferenced code that shallow tests leave in.
- **[Phase-tagging complexity]** Diffing coverage per phase needs a baseline. → Use the coverage report's per-file numbers and a changed-files list from git; if diff tooling proves fragile, fall back to whole-repo gate with a temporarily lowered threshold for known-legacy files (documented exception list, shrinking each phase).
- **[knip false positives on dynamic imports]** Next.js dynamic routes and Drizzle table refs can look unreferenced. → knip config explicitly whitelists App Router entry points and `src/db/schema.ts` exports; false positives resolved in config, not by ignoring the gate.
- **[Commented-out-code rule noise]** Legitimate doc-comment blocks might trip a naive rule. → Rule targets code-like patterns (lines starting with code tokens after `//`/`/*`), not prose comments; tuned to avoid noise.
