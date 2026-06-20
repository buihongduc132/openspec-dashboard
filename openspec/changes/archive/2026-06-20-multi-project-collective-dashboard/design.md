## Context

The app today (`commit e38f266`) has a Next.js 16 App Router surface with a
projects list (`/projects`), a dashboard home (`/`), a new-project form, and
per-project detail pages. The data model (`src/db/schema.ts`, 18 tables)
already has a `projects` table with `id`, `name`, `rootPath`, `defaultSchema`,
`description`, `createdAt`, `updatedAt`. So the registry a collective
dashboard needs **already exists** — what's missing is (a) the *aggregation*
view that treats multiple projects as one dataset, and (b) an *enrollment*
on-ramp that gets a local (and later remote) project into that registry with
the right metadata.

The user's reframing is: the dashboard is not a project list, it is a
**collective view** that happens to list projects as one of its sections. A
single project is something you drill into, not the landing surface.

## Goals / Non-Goals

**Goals:**

- Make `/` the collective, aggregated multi-project overview.
- Add a guided **local enrollment** flow (select dir → detect OpenSpec → offer
  `openspec init` if needed → register).
- Add a **stubbed remote-git enrollment** path that detects `gh` / `glab` and
  records intent, without yet cloning.
- Make the collective ↔ single-project navigation reversible and visually
  unambiguous.
- Reuse the existing `projects` table; add only minimal enrollment-source
  metadata.

**Non-Goals:**

- Full remote clone + projection (lands with git integration, req 08.4).
- Any multi-tenant / auth concerns (that is Phase 3a, change
  `build-openspec-dashboard-mvp`).
- The per-project OpenSpec views themselves (owned by
  `build-openspec-dashboard-mvp`); this change only navigates *into* them.
- Replacing the parser/projection engine (out of scope entirely).

## Decisions

**D-MPCD-1: Reuse the `projects` table; add two nullable columns.** No new
table. Add `enrollmentSource` (`"local" | "remote-git"`, default `"local"`) and
`remoteGitUrl` (text, nullable). Existing rows default to `"local"`. A Drizzle
migration is added; this is additive and non-breaking.

**D-MPCD-2: Collective `/` is built from aggregation queries, not a new
store.** Cross-project counts are computed at read time by summing over the
existing per-project tables (`changes`, `tasks`, audit-log-derived activity).
No materialized aggregate table in this change; if read latency suffers at
scale (>~50 projects), a cached aggregate can be added later (cache at the
sub-query level per the project's global-caching rule). For the MVP, a single
page-level `Promise.all` of per-table counts is acceptable.

**D-MPCD-3: Local enrollment uses a server-validated path input, not a native
directory picker.** In a browser, a true OS directory picker (`<input
webkitdirectory>`) only returns relative file lists, not the absolute path the
server needs to read the repo. For a local/dev dashboard (the only deployment
mode before Phase 3a auth), the user **types or pastes an absolute path**; the
server validates it against an allow-list of enrollment roots
(`OPENSPEC_DASHBOARD_ENROLL_ROOTS`, a `:`-separated list, default the repo
root + `~/Documents/Projects`). This is simpler and safer than guessing paths,
and avoids arbitrary-FS-traversal risk. A future native picker can layer on
later.

**D-MPCD-4: `openspec init` is offered but never automatic.** When the chosen
directory lacks `openspec/config.yaml`, the flow offers to run the OpenSpec
CLI's `init`. The CLI is invoked server-side via a typed child-process call
(`execa` or `child_process.spawn`), streaming stdout/stderr to the UI. It runs
**only on explicit user acceptance**. No mutation without consent.

**D-MPCD-5: Remote-git detection is real; clone is stubbed.** The flow shells
out to `gh auth status` / `glab auth status` (JSON) to detect an authenticated
CLI matching the URL's host. It then records the project as a *pending remote*
project (`enrollmentSource = "remote-git"`, projected = false) and tells the
user full clone is pending. No clone runs in this change. This makes the
feature discoverable and lets us validate the UX before git integration lands.

**D-MPCD-6: Navigation model is two explicit scopes.** `collective` (`/`) and
`single-project` (`/projects/[id]/*`). The single-project layout already wraps
its children; this change adds a consistent "All projects" breadcrumb in the
single-project layout and ensures the collective page heading makes its scope
obvious. No third "workspace-aggregation" scope in this change.

## Risks / Trade-offs

- **Path allow-list is a hardening baseline, not a full sandbox.** Local
  enrollment reads from the user's own filesystem in a single-user dev
  dashboard, so the allow-list is defense-in-depth against accidental
  traversal, not a multi-user security boundary. Multi-user sandboxing is
  Phase 3a. Mitigation: allow-list is required (no default-open), and reads
  are limited to the chosen root + its `openspec/` subtree.
- **Stubbed remote path can feel "broken".** Mitigation: the UI must be
  explicit ("planned — full clone lands with git integration") and record the
  enrollment as pending so it is real data, not a dead button.
- **Aggregation at read time.** Fine for tens of projects; for hundreds it
  needs caching. Mitigation: keep aggregation queries index-backed and revisit
  if NFR-2 (read latency) regresses; do not add a cache speculatively.
- **Two columns on `projects` couples enrollment to the registry table.**
  Acceptable — enrollment *is* a registry concern, and the columns are nullable
  so they don't affect the existing per-project flow.
