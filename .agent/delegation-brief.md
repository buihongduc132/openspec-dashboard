# SHARED DELEGATION BRIEF — OpenSpec Phase Proposal

You are producing ONE openspec change proposal for a specific phase of the OpenSpec Dashboard. Every comrade receives this identical brief plus a phase-specific scope section. Your job: create a complete, apply-ready openspec change (proposal.md + specs/ + design.md + tasks.md) using the openspec-propose workflow.

---

## PART 1 — Your exact workflow (the openspec-propose skill, verbatim)

Propose a new change — create the change and generate all artifacts in one step. Create a change with artifacts: proposal.md (what & why), design.md (how), tasks.md (implementation steps).

**Input**: the change name is given to you in your phase scope below.

**Steps**:

1. Create the change directory: `openspec new change "<name>"` (creates scaffolded change in `openspec/changes/<name>/`).

2. Get the artifact build order: `openspec status --change "<name>" --json`. Parse: `applyRequires` (artifact IDs needed before implementation), `artifacts` (status + deps), `planningHome`, `changeRoot`, `artifactPaths`, `actionContext`.

3. Create artifacts in sequence until apply-ready. Loop through artifacts in dependency order (no pending deps first):
   a. For each `ready` artifact: `openspec instructions <artifact-id> --change "<name>" --json`. The JSON has: `context` (constraints for you — do NOT include in output), `rules` (constraints — do NOT include), `template` (structure to use), `instruction` (schema guidance), `resolvedOutputPath` (where to write), `dependencies` (completed artifacts to read).
   b. Read completed dependency files for context. Create the artifact using `template` as structure. Write to `resolvedOutputPath`. Apply `context`/`rules` as constraints but do NOT copy `<context>`/`<rules>`/`<project_context>` blocks into the file. Show brief progress: "Created <artifact-id>".
   c. After each artifact, re-run `openspec status --change "<name>" --json`. Check every ID in `applyRequires` has `status: "done"`. Stop when all `applyRequires` artifacts are done.

4. Show final status: `openspec status --change "<name>"`.

**Artifact rules**:
- Follow `instruction` field for each artifact type.
- `proposal.md`: Why (1-2 sentences problem), What Changes (specific bullets, mark **BREAKING**), Capabilities (New: kebab-case names → each becomes `specs/<name>/spec.md`; Modified: existing specs whose REQUIREMENTS change). Keep 1-2 pages. Capabilities section is CRITICAL — it creates the proposal↔specs contract.
- `specs/<name>/spec.md`: Use `## ADDED Requirements`, `### Requirement: <name>` (SHALL/MUST), `#### Scenario: <name>` (WHEN/THEN — MUST use exactly 4 hashtags `####`). Every requirement MUST have ≥1 scenario. Testable.
- `design.md`: Context, Goals/Non-Goals, Decisions (why X over Y, alternatives), Risks/Trade-offs. Architecture not line-by-line.
- `tasks.md`: Grouped under `## 1.` headings, each task `- [ ] X.Y desc`. Apply-ready checkbox format. Small, verifiable, dependency-ordered.

**Guardrails**: Create ALL artifacts needed for implementation (per `apply.requires`). Read dependency artifacts before creating new ones. Verify each file exists after writing.

---

## PART 2 — Project context (identical for all comrades)

**Repo**: `/home/bhd/Documents/Projects/bhd/openspec-dashboard` — you are already in this directory. Working directory is correct.

**What this project is**: A management server + Kanban UI for OpenSpec (spec-driven development). Next.js 16 App Router + Drizzle ORM + PostgreSQL + React 19 + Tailwind 4 + Radix/shadcn UI. Public repo: https://github.com/buihongduc132/openspec-dashboard

**The master requirements** live in `flow/requirements/`:
- `flow/requirements/README.md` — INDEX. Contains cross-cutting invariants **INV-1..INV-9**, the **Section Granularity Table**, **Authority Contract**, **Decisions D-*** (single source of truth), and **NFRs (NFR-1..NFR-12)**. READ THIS FIRST.
- `flow/requirements/01-project-workspace.md` through `09-auth-multitenancy.md` — 9 domain requirement files. YOUR PHASE scope references specific req numbers; read the relevant ones.
- `flow/plans/2026-06-18_openspec-dashboard-mvp.md` — the phased plan. YOUR PHASE is one section of this (§0..§4). Read your section AND §7 (requirement→phase matrix) to know exactly which reqs you own.

**CRITICAL — new testing standard (applies to ALL phases)**:
- `INV-9` (cross-cutting invariant): Test-first, no dead code. Every production-code change has tests written FIRST (red→green→refactor). Coverage gates: **unit/TDD line > 80%**, **integration line > 40%** (instrumentation ON during integration). No dead code.
- `D-TDD` (decision): TDD mandatory; coverage gates in CI; dead-code detector in CI.
- `NFR-12`: unit > 80%, integration > 40%, zero dead code — measured per phase.
- There is a companion openspec change `openspec/changes/tdd-coverage-standard/` that owns the tooling (Vitest, testcontainers, knip, CI gates). YOUR phase proposal MUST **cite** `testing-standard` in its design (single source of truth — do NOT restate the 80%/40% numbers; reference the capability). YOUR phase's `tasks.md` MUST include test-writing steps for each implementation task. YOUR phase's verifier-loop gate checks coverage + dead code.

**Existing openspec changes** (do NOT duplicate these scopes):
- `build-openspec-dashboard-mvp` — a MEGA-proposal that declared 10 capabilities but only specced 3 (tasks-kanban, dashboard-foundation, project-workspace). THIS IS THE ANTI-PATTERN you are fixing — your phase proposal will be the CORRECT, scoped replacement for your phase's slice.
- `multi-project-collective-dashboard` — owns the collective multi-project layer + enrollment.
- `sidebar-agent-console` — owns launching local CLI agents from a sidebar.
- `copy-entity-reference` — owns the "copy AI-agent reference" affordance.
- `tdd-coverage-standard` — owns the testing tooling (cite this, don't re-create).

**Existing main specs**: `openspec/specs/` is EMPTY — greenfield. Your capabilities are NEW (use `## ADDED Requirements`).

**Stack specifics to respect**: Next.js App Router (server components for data, client components for interactivity), Drizzle ORM (not raw SQL), `navigator.clipboard` for browser features, Radix UI primitives for components. No new runtime deps without justification in design.

---

## PART 3 — YOUR PHASE SCOPE (comrade-specific)

<<<PHASE_SCOPE_PLACEHOLDER>>>

---

## PART 4 — Quality bar (what gets you past the verifier-loop)

Your proposal will be verified by a BLIND verifier-loop after you finish. Verifiers check:
1. **Edge cases covered**: did you spec the failure modes (not found, conflict, partial, concurrent, empty, oversized, permission)? Every requirement needs ≥1 happy + ≥1 unhappy scenario.
2. **Not overengineered**: no speculative features, no "future-proofing" for unrequested capabilities, no gold-plating. If the plan says "Phase X", you spec Phase X only — not Phase X+1 sneak-ins.
3. **No missing requirements**: cross-check your phase's req numbers (from the §7 matrix) against your specs. Every req your phase owns MUST have a corresponding spec. No orphans, no phantoms.
4. **Cites testing-standard**: your design references `testing-standard` capability; your tasks include test steps. (INV-9 / NFR-12.)
5. **No contradictions** with INV-1..INV-9, the Authority Contract, or existing decisions D-*.
6. **Concise**: 1-2 page proposal; specs are testable not prose; design explains WHY not line-by-line HOW.

When done: report back the change name, the artifacts created, and confirm `openspec status --change "<name>"` shows 4/4 complete.
