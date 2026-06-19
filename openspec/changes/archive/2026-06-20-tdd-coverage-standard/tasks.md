## 1. Test runner + coverage setup

- [x] 1.1 Add devDependencies: `vitest`, `@vitest/coverage-v8`, `jsdom` (for component unit tests), `@testing-library/react`, `@testing-library/jest-dom`
- [x] 1.2 Create `vitest.config.ts` with two projects (unit, integration); unit project uses jsdom environment, integration project uses node environment; both use v8 coverage provider
- [x] 1.3 Configure coverage thresholds in vitest config: unit project `lines > 80`, integration project `lines > 40`; `coverage.include = ['src/**/*.{ts,tsx}']`, `coverage.exclude` for `*.test.*`, `*.d.ts`, `src/db/seed.ts`
- [x] 1.4 Add `npm scripts`: `test` (unit, watch off, CI mode), `test:unit` (explicit), `test:integration` (integration project), `test:coverage` (unit + coverage report), `test:integration:coverage`

## 2. Integration test infrastructure

- [x] 2.1 Add devDependencies: `testcontainers` (Postgres module)
- [x] 2.2 Create `tests/integration/setup.ts` that starts a Postgres testcontainer, runs Drizzle migrations, exposes a `getDb()` helper, and tears down after the suite
- [x] 2.3 Create a `tests/integration/helpers.ts` with route-handler invocation helpers (call Next.js App Router route handlers in-process with a real Request)
- [x] 2.4 Write one smoke integration test (`tests/integration/health.test.ts`) hitting `/api/health` against the testcontainer DB to prove the harness end-to-end; verify line coverage is collected (instrumentation ON)

## 3. Dead-code detection

- [x] 3.1 Add devDependency: `knip`
- [x] 3.2 Create `knip.config.ts` (or `knip.json`) whitelisting App Router entry points (`src/app/**/page.tsx`, `layout.tsx`, `route.ts`, `not-found.tsx`) and `src/db/schema.ts` table exports as entry points
- [x] 3.3 Add ESLint rule for commented-out code (eslint-plugin or custom rule matching code-like lines after `//`/`/*`); tune to avoid prose-comment false positives
- [x] 3.4 Add `npm scripts`: `knip` (run knip), `lint:deadcode` (run the commented-out-code rule)

## 4. CI gates

- [x] 4.1 Create/extend `.github/workflows/ci.yml` (or repo equivalent) with jobs: `unit-tests` (`npm run test:coverage`, fails if unit lines ≤ 80), `integration-tests` (`npm run test:integration:coverage`, fails if integration lines ≤ 40), `dead-code` (`npm run knip && npm run lint:deadcode`)
- [x] 4.2 All three jobs are required status checks on PRs to `main`
- [x] 4.3 Verify line coverage is ON during the integration job (assert the coverage JSON is produced and contains real per-file line data, not zeros)

## 5. Documentation + wiring

- [x] 5.1 Update `AGENTS.md` with a one-line pointer: "All code follows INV-9 / D-TDD / NFR-12 — TDD-first, unit >80% / integration >40% line coverage, zero dead code. See `openspec/changes/tdd-coverage-standard`."
- [x] 5.2 Add a "Testing" section to README documenting `npm run test`, `test:integration`, `test:coverage`, the thresholds, and the TDD-first rule
- [x] 5.3 Confirm `flow/requirements/README.md` carries INV-9, D-TDD, NFR-12 (already applied — verify present)

## 6. Verification

- [x] 6.1 `npm run test:coverage` runs unit suite and reports a line-coverage number; confirm threshold logic (manually break a test to see the gate trigger)
- [x] 6.2 `npm run test:integration:coverage` runs integration suite with coverage ON; confirm a real measured number appears
- [x] 6.3 `npm run knip` runs clean on the current tree (or reports only documented legacy exceptions)
- [x] 6.4 CI workflow file is syntactically valid (actionlint or equivalent) and all three jobs are defined as required
- [x] 6.5 Verifier-loop: 2 fresh blind verifiers confirm the spec (gates >80%/>40%, instrumentation ON, dead-code prohibition, per-phase citation) is met by the tasks; reject if overengineered or if edge cases (testcontainer teardown, knip false positives, forward-only baseline) are unhandled
