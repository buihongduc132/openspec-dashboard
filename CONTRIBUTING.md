# Contributing to openspec-dashboard

Thanks for your interest in contributing! `openspec-dashboard` is the
management server + Kanban UI for [OpenSpec](https://github.com/Fission-AI/OpenSpec)
spec-driven development, and it dogfoods OpenSpec to track its own roadmap.
This guide gets you from a fresh clone to a merged change.

Public repo: https://github.com/buihongduc132/openspec-dashboard

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Repository layout](#repository-layout)
- [Local dev setup](#local-dev-setup)
- [Running the tests](#running-the-tests)
- [Type checking & linting](#type-checking--linting)
- [The OpenSpec change workflow](#the-openspec-change-workflow)
- [Pull request checklist](#pull-request-checklist)
- [Security & secret hygiene](#security--secret-hygiene)

## Code of conduct

Be kind, be respectful, and assume good intent. We expect constructive,
professional interaction in issues, PRs, and review. Personal attacks,
harassment, and dismissive language are not tolerated. Disagree about the
code, not the person.

## Repository layout

```
src/
  app/            Next.js App Router routes (pages + API handlers)
  components/      React UI (shadcn/ui based)
  db/              Drizzle schema, seed, aggregation helpers
  lib/             Domain modules (parser, projection, auth, tasks, ...)
docs/              Long-form docs (threat model, a11y, demo)
tests/             unit / integration / load / a11y / probes
openspec/          THIS PROJECT's own OpenSpec tree (dogfooded)
flow/              Product direction: intentions, findings, requirements, plans
```

`AGENTS.md` is the canonical index of product direction (intents,
findings, requirements, plans). `flow/` holds the source-of-truth docs.
Read those before non-trivial design changes.

## Local dev setup

Prerequisites: Node.js 20+ and PostgreSQL (or `DATABASE_URL` pointing at one).

```bash
git clone https://github.com/buihongduc132/openspec-dashboard.git
cd openspec-dashboard
cp .env.example .env.local      # set DATABASE_URL (and optionally REFERENCE_REPO_ROOT)
npm install
npm run dev                     # http://localhost:3000
```

For the parser/projection to resolve reference paths for the
[Copy reference](./README.md#copy-reference) feature when talking to
containerized agents, set `REFERENCE_REPO_ROOT` to the repo root as the
agent sees it.

## Running the tests

The suite is split into unit and integration tiers:

```bash
npm run test            # unit tests (vitest, vitest.config.unit.ts)
npm run test:watch      # unit tests in watch mode
npm run test:integration# integration tests (vitest + testcontainers)
npm run test:coverage   # unit tests with coverage
```

Integration tests spin up Postgres via testcontainers, so they need Docker
available. Unit tests are hermetic and run anywhere.

## Type checking & linting

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
npm run build            # next build (production; needs DATABASE_URL)
npm run knip             # dead-code / unused-dep audit
```

CI requires `typecheck`, `lint`, and `next build` to be clean, and
`npm run lint:deadcode` (commented-code detector) to pass.

## The OpenSpec change workflow

This repo dogfoods OpenSpec. Every non-trivial change is tracked as an
OpenSpec **change** under `openspec/changes/<change-name>/` containing:

- `proposal.md` — why + what changes + impact
- `tasks.md` — the work breakdown, checked off as it lands
- `specs/<capability>/spec.md` — delta spec(s): ADDED / MODIFIED / REMOVED
  requirements with Given/When/Then scenarios

Typical flow:

1. **Open or pick a change.** `openspec list` shows changes; `openspec
   status <change>` shows progress against `tasks.md`.
2. **Read the delta specs.** The requirements + scenarios in
   `openspec/changes/<change>/specs/` are the definition of done. If a
   task is unclear, the spec scenario is authoritative.
3. **Implement.** Make small, reviewable commits. Keep the diff inside the
   scope of the task you picked — do not scope-creep across tasks.
4. **Update `tasks.md`.** Flip `- [ ]` → `- [x]` for completed items as
   they land.
5. **Validate.** `openspec validate <change>` must pass before the change
   can be archived.
6. **Archive.** When all tasks are done and validated, archive the change
   (the dashboard's single-archive flow writes the inverse patch and
   advances the monotonic archive sequence).

Specs under `openspec/specs/` (the *main* specs) are never edited directly
by a change's working copy — changes *propose* deltas to them, and archiving
applies the delta. See `flow/requirements/02-specs.md` (D-MainSpecCRUD).

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] `npm run typecheck` is clean
- [ ] `npm run lint` is clean
- [ ] `npm run test` passes (and `npm run test:integration` if you touched
      a DB-backed path)
- [ ] `npm run build` succeeds
- [ ] If this is a behavior change, there's a corresponding OpenSpec change
      (proposal + delta spec + tasks) and `openspec validate` passes
- [ ] No secrets / credentials in the diff (see below)
- [ ] PR description links the OpenSpec change and summarises the delta

Prefer small PRs that map to one or a few OpenSpec tasks. If a PR spans
multiple capabilities, split it.

## Security & secret hygiene

This project has a strict secret-scan gate (Phase 0.6):

- A **pre-commit** and **pre-push** gitleaks hook (`.githooks/`) blocks
  known-secret patterns locally.
- CI runs a gitleaks gate on every push.
- An **initial-push history scan** is run retroactively on new public
  repos to catch anything that slipped in before the hooks existed.

Never commit credentials, API keys, or `.env` files. If you need a secret
for local dev, put it in `.env.local` (gitignored) and document the
**name** (never the value) in `.env.example`. If a secret ever lands in
history, treat it as compromised — rotate it, don't just delete the line.

Before any auth/key/token work, re-read the threat model
([`docs/threat-model/v1.md`](./docs/threat-model/v1.md)) and the
trust-boundary requirements in `flow/requirements/09-auth-multitenancy.md`.
