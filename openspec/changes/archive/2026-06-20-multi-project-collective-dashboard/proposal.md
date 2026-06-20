## Why

The current app treats a project as the top-level object: the home page
already lists projects and lets you open one. But the user's mental model is
different — **the dashboard itself is the collective, multi-project view**, and
a single enrolled project is something you drill *into* from that collective,
not the landing surface. Two things are missing to match that mental model:

1. **Enrollment as a first-class action.** Today a project row exists but there
   is no guided "select a local folder and enroll it" flow, and no path at all
   for a remote git repository reachable through the `gh` / `glab` CLIs the
   local machine already has authenticated.
2. **The collective overview.** Today the home page shows per-project stats
   side by side, but there is no aggregated, cross-project summary of what is
   happening across all enrolled projects (changes in flight, tasks across
   projects, spec coverage). The dashboard should answer "what is moving across
   everything I track", then let me drop into one project's OpenSpec details.

This change reshapes the navigation model from "project list → project" to
**"collective dashboard → enrolled project → that project's OpenSpec view"**,
adds the local-enrollment flow, and adds a planned (stubbed, not-yet-functional)
remote-git enrollment path via `gh` / `glab` so the feature is discoverable
without being blocked on git integration landing.

This builds on the existing `build-openspec-dashboard-mvp` change (which owns
the parser, projection, and per-project modules). The boundary: that change
owns what happens *inside* one enrolled project; this change owns the
**collective layer above projects** and the **enrollment on-ramp** that gets a
project into the dashboard in the first place.

## What Changes

- **Reframe the dashboard as the collective landing surface.** `/` becomes the
  multi-project overview (aggregated metrics across all enrolled projects),
  not just a project list. Per-project cards remain, but the page leads with
  cross-project aggregation.
- **Add a local-enrollment flow.** From the dashboard, the user selects a local
  directory, the app detects whether it is an OpenSpec project
  (`openspec/config.yaml` present) and either enrolls it as-is or offers to run
  `openspec init` to make it one. Enrollment records the project in the
  dashboard's registry (existing `projects` table) and projects it.
- **Add a remote-git enrollment path (planned / stubbed).** A second enrollment
  tab lets the user paste a GitHub (`gh`) or GitLab (`glab`) URL. The local
  machine already has authenticated `gh` / `glab` CLIs, so enrollment clones
  (or opens) the repo through that CLI into a managed location and enrolls the
  local clone. In this change the flow is **stubbed** — the UI exists and is
  reachable, the CLI detection runs, but full clone + projection is wired in a
  later change once git integration (req 08.4) lands.
- **Clarify the drill-down.** Clicking an enrolled project card leaves the
  collective view and enters that project's OpenSpec view (specs, changes,
  tasks, schemas — owned by the `build-openspec-dashboard-mvp` change). The
  collective dashboard always has a "back to all projects" affordance.

## Capabilities

### New Capabilities

- `multi-project-dashboard`: the collective, cross-project overview surface —
  aggregated metrics, enrollment entry points, and navigation into individual
  enrolled projects.

### Modified Capabilities

_(none — `multi-project-dashboard` is greenfield. It composes with the
existing `project-workspace` capability from `build-openspec-dashboard-mvp`,
which owns the single-project registry/schema once a project is enrolled.)_

## Impact

- **Code**:
  - `src/app/page.tsx` (dashboard home) — reframe from project list to
    collective overview + enrollment entry points.
  - `src/app/projects/page.tsx` — remains as the project registry list, but is
    now reached as "manage enrolled projects" rather than as the landing page.
  - `src/app/projects/new/page.tsx` — extended into an enrollment flow with two
    tabs (local, remote-git) instead of a single manual form.
  - New client component for the enrollment flow (local path picker +
    OpenSpec-detection + `openspec init` offer).
  - New aggregation queries for cross-project metrics (reused per-project
    reads; no new tables).
- **Schema**: no new tables. Enrollment reuses the existing `projects` table;
  adds two nullable columns for the enrollment source: `enrollmentSource`
  (`"local" | "remote-git"`) and `remoteGitUrl` (string, nullable).
- **External**:
  - Local filesystem read access to the user's selected directory (path must be
    inside an allow-list of roots the operator configures — no arbitrary FS
    traversal).
  - `gh` and `glab` CLI binaries on PATH; enrollment shells out to them and
    parses JSON output. The remote path is **stubbed** in this change.
- **Dependencies to add**: a directory-picker approach (HTML `<input
  webkitdirectory>` for browser, or a server-side path input for local/dev
  mode); optional `execa` for typed CLI shelling-out.
- **Public repo**: no secrets introduced (no tokens — `gh`/`glab` use their own
  authenticated state). Safe for the existing public repo.
- **Relationship to other changes**: depends conceptually on
  `build-openspec-dashboard-mvp` for per-project OpenSpec views; does not
  modify that change's artifacts. The remote-git enrollment is the on-ramp that
  later git integration (req 08.4) will fully wire.
