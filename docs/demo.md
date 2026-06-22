# Demo walkthrough

An end-to-end tour of `openspec-dashboard`: from a freshly registered
project to a live Kanban board with spec-driven tasks. Use this as a smoke
test after a clean install, or as the "what does this thing do?" intro.

> The dashboard dogfoods OpenSpec on itself, so this same walkthrough is
> exactly how the dashboard's own roadmap (`openspec/changes/build-openspec-dashboard-mvp`)
> is tracked. Real screenshots live alongside each step in the README.

## Prerequisites

- PostgreSQL reachable via `DATABASE_URL`
- Node 20+
- An OpenSpec repo to register (or register this repo on itself)

```bash
cp .env.example .env.local      # set DATABASE_URL
npm install
npm run dev                     # http://localhost:3000
```

The seed data already covers all 18 tables, so the dashboard is populated
out of the box.

## 1. Register a project

1. Open **http://localhost:3000** → click **Projects** in the sidebar.
2. Click **New project** and fill in a **name**, the **root path** of an
   OpenSpec repo, and a **default schema**.
3. Submit. The dashboard:
   - creates a project row with a stable UUID,
   - records the root path,
   - does **not** mutate the target repository (registration is read-only
     until sync is explicitly enabled — req 01 §1.1–1.3).

You'll land on the **project detail** page, which shows spec counts, change
counts, and the parsed OpenSpec tree.

## 2. Browse specs

1. In the sidebar, go to **Specs** (project-scoped) or open the project's
   **Spec domains**.
2. Pick a spec domain. The detail page lists every **requirement** and its
   **scenarios** (Given/When/Then), parsed straight from
   `openspec/specs/<domain>/spec.md`.
3. Use **Copy reference** (markdown or JSON) on any requirement to hand it
   to a coding agent without retyping the path.

To propose a change to a spec, hit **Propose via change** — this creates a
new OpenSpec change with a delta spec rather than editing the main spec
directly (D-MainSpecCRUD).

## 3. Browse changes & tasks

1. Go to **Changes**. Each change card links to its proposal, design,
   delta specs, and `tasks.md`.
2. Open a change. The change detail shows the proposal, the artifact graph
   (proposal → design → delta specs → tasks), and the live task list.

## 4. Work the Kanban board

This is the heart of the dashboard.

1. Open the **Kanban** board (project-scoped from a project, or the global
   board from the sidebar).
2. The default columns are **Backlog → Ready → In Progress → Review → Done**.
3. **Drag a card** from *Backlog* to *In Progress*. On drop, the dashboard
   `PATCH`es the task's status and it persists across reloads.
4. Can't drag? Use the keyboard: focus a card and move it between columns
   without a pointing device (WCAG 2.2 AA §2.5.7 Dragging Movements —
   NFR-9). See [`docs/accessibility/dnd-manual-at.md`](./accessibility/dnd-manual-at.md).

Each task has a **stable UUID** assigned at first-seen (stored in the
sidecar `openspec/.dashboard/tasks/<change>.json`). Renumber a task line in
`tasks.md` and it keeps its UUID, status, comments, and history — the
Markdown is just the display layer.

## 5. Schemas & validation

1. Go to **Schemas**. The list shows every registered schema and its
   version.
2. Open a schema to validate it and inspect the **resolution debug** view
   (which artifact contributed which rule).
3. Run **project-wide validation** from the validation dashboard to see
   the heuristic verifier's pass/fail matrix across all changes and specs.

## 6. Activity & analytics

- The **dashboard home** (`/`) shows real DB stats across all projects.
- The **activity timeline** surfaces recent state-changing operations.
- The **velocity chart** tracks task throughput over time.

Every state-changing op is appended to a per-project **audit log** whose
entries form a SHA-256 hash-chain; the chain verifier detects tampering or
gaps (NFR-10).

## Where to go next

- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — local setup, tests, and the
  OpenSpec change workflow.
- [`AGENTS.md`](../AGENTS.md) — the product-direction index (intents,
  findings, requirements, plan).
- [`docs/threat-model/v1.md`](./threat-model/v1.md) — the security threat
  model.
- [`README.md`](../README.md) — quick start + the **Copy reference**
  capability reference.
