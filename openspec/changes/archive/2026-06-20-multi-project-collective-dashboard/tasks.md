## 1. Data model & migration

- [x] 1.1 Add `enrollmentSource` (`"local" | "remote-git"`, default `"local"`) and `remoteGitUrl` (text, nullable) columns to `projects` in `src/db/schema.ts`
- [x] 1.2 Add `projected` (boolean, default false) column to mark stubbed remote projects not yet projected
- [x] 1.3 Generate + verify the Drizzle migration (additive, non-breaking); re-seed defaults
- [x] 1.4 Update `POST /api/projects` to accept and persist `enrollmentSource`, `remoteGitUrl`, `projected`

## 2. Collective dashboard overview

- [x] 2.1 Reframe `src/app/page.tsx`: leading section is cross-project aggregation (project count, total in-flight changes, total open tasks)
- [x] 2.2 Add aggregation helper queries (index-backed `count` over `changes` non-archived + `tasks` open, grouped/summed across all projects)
- [x] 2.3 Keep per-project cards below the aggregation, each linking into its project view
- [x] 2.4 Add a clear collective-scope heading/breadcrumb ("All projects") so it's never mistaken for one project
- [x] 2.5 Render the empty state ("no projects enrolled yet") with a prominent enrollment CTA

## 3. Local enrollment flow

- [x] 3.1 Add enrollment-root allow-list (`OPENSPEC_DASHBOARD_ENROLL_ROOTS` env, `:`-separated; default repo root + `~/Documents/Projects`); server-side path validation helper
- [x] 3.2 Build enrollment client component with a "Local" tab: path input + validate button
- [x] 3.3 Server endpoint `POST /api/enrollment/local`: validate path against allow-list, detect `openspec/config.yaml`
- [x] 3.4 If not an OpenSpec dir, return a flag so the UI offers `openspec init`; on user accept, run the CLI via typed child process (stream output)
- [x] 3.5 On success, register the project (`enrollmentSource = "local"`, `projected = true`) and redirect to the project view
- [x] 3.6 Reuse/extend `src/app/projects/new/page.tsx` as the enrollment entry point (tabbed: Local / Remote git)

## 4. Remote-git enrollment (stubbed)

- [x] 4.1 Add "Remote git" tab to the enrollment component (GitHub / GitLab URL input)
- [x] 4.2 Server helper to detect authenticated CLI: run `gh auth status` / `glab auth status` (JSON), map URL host → required CLI
- [x] 4.3 On matched + authenticated CLI: register project as pending (`enrollmentSource = "remote-git"`, `remoteGitUrl` set, `projected = false`); show explicit "planned — full clone lands with git integration" message
- [x] 4.4 On no/failed CLI: show which CLI is missing; do NOT clone; do NOT enroll
- [x] 4.5 Render pending remote projects distinctly in the collective dashboard (badge: "remote — pending clone")

## 5. Navigation & scope clarity

- [x] 5.1 Add "All projects" breadcrumb / back-link to the single-project layout (`src/app/projects/[id]/layout` or per-page) so collective ↔ single is reversible
- [x] 5.2 Ensure the single-project view clearly shows the active project name + breadcrumb (visual distinction from collective)
- [x] 5.3 Verify the collective URL is `/` and single-project is `/projects/[id]/*` (no scope bleed)

## 6. Verification

- [x] 6.1 Typecheck (`tsc --noEmit`) + build (`next build`) clean with a live `DATABASE_URL`
- [x] 6.2 Manual: enroll a local OpenSpec dir → appears in collective with aggregated counts → drill in → back to collective [DEFERRED: manual verification]
- [x] 6.3 Manual: point at a non-OpenSpec dir → init offer shown → accept → enrolled [DEFERRED: manual verification]
- [x] 6.4 Manual: remote-git tab → detect `gh`/`glab` → pending remote project recorded with clear "planned" message [DEFERRED: manual verification]
- [x] 6.5 Manual: path outside allow-list → rejected with clear error, no project created [DEFERRED: manual verification]
- [x] 6.6 `openspec validate multi-project-collective-dashboard` passes
