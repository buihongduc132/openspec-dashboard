## Why

Today the dashboard is a read surface over OpenSpec artifacts: you can browse
specs, changes, tasks, and kanban, but to actually *do* OpenSpec work — propose
a change, explore an idea, apply tasks, archive — you leave the dashboard and
open a terminal running a local CLI agent (`pi`, `claude`, `codex`, …) in the
project directory. The mental and navigational context switch is the friction:
the dashboard knows which project you're in and what its state is, but the agent
doing the work is a separate window with no link back.

The user's ask is to collapse that boundary: **launch a local CLI agent from a
sidebar in the dashboard, stream its output into the UI, discover and run its
local slash commands (the `opsx-*` / `openspec` commands among them) as if you
were in the terminal, and have the agent's file changes land in the project the
dashboard is already viewing so they immediately render in the UI.**

The reference for the streaming pattern is Fusion
(https://github.com/Runfusion/Fusion): a dashboard that runs local agents and
wires their real-time streams into a single pane of glass, with resumable
streams. We adopt the same shape — a server-side spawned agent process whose
stdout/stderr/exit stream into a client panel — but scoped to a **single local
session per sidebar tab**, not Fusion's multi-node mesh. (Fusion's multi-node
mesh, agent companies, and missions are explicitly out of scope.)

This composes with two existing changes without overlapping them:

- `multi-project-collective-dashboard` owns the *enrolled project registry* and
  its `rootPath`. This change launches the agent with `cwd = rootPath`, so the
  "local directory which the dashboard already loads" is exactly the enrolled
  project.
- `build-openspec-dashboard-mvp` owns the *parser + projection* that turns the
  project's `openspec/` tree into the UI's spec/change/task views. This change
  triggers a projection refresh after the agent reports file changes, so the
  agent's edits "get displayed into the UI itself" through the existing
  projection layer rather than a parallel one.

## What Changes

- **Add an agent-console sidebar.** A slide-in/side panel in the dashboard
  layout (collective view and per-project view) that hosts one or more agent
  sessions. Each session is a real local CLI agent process spawned server-side
  with `cwd` set to the active project's `rootPath`.
- **Stream agent output to the UI.** Using a Fusion-style real-time stream —
  Server-Sent Events (SSE) for agent→UI output (resumable, HTTP-native,
  proxy-friendly) and a POST endpoint for UI→agent input. A real pseudo-terminal
  (PTY) backs each session so TUI agents (pi, claude, codex) render correctly,
  not just line-buffered stdout.
- **Discover slash commands locally.** When a session starts in a project, the
  sidebar discovers that agent's available slash commands from the project's
  local config (e.g. pi's `.pi/prompts/*.md` and the OpenSpec skills' commands
  — the `opsx-*` family). Discovered commands render as a quick-pick list and
  are sent to the agent on selection, so `/opsx-propose`, `/opsx-explore`,
  `/opsx-apply`, etc. work exactly as in the CLI.
- **Send changes to the real project directory.** Because the agent runs with
  `cwd = rootPath`, every file it edits lands in the actual enrolled project on
  disk — the same directory the dashboard already loads. No copy, no staging
  area.
- **Refresh the UI after changes.** When the agent signals file activity (or on
  a user "refresh" action), the sidebar triggers the projection layer
  (`build-openspec-dashboard-mvp`) to re-parse the project, and the updated
  specs/changes/tasks render in the existing views. This change owns only the
  *trigger*; the projection itself belongs to the other change.
- **Configurable agent roster.** The operator configures which local CLI agents
  are launchable (default: `pi`, since pi is already installed and ACP-native;
  optional: `claude`, `codex`, `gemini`). The sidebar shows only configured +
  detected-on-PATH agents.

## Capabilities

### New Capabilities

- `sidebar-agent-console`: the in-dashboard launcher + real-time stream panel
  for local CLI agents, with per-project slash-command discovery, change-to-disk
  passthrough, and a projection-refresh trigger.

### Modified Capabilities

_(none — greenfield. Composes with `multi-project-collective-dashboard`
(provides `rootPath`) and `build-openspec-dashboard-mvp` (provides projection +
per-project views). This change does not modify either's artifacts.)_

## Impact

- **Code**:
  - `src/components/` — new `agent-console/` component tree (sidebar shell,
    session tabs, terminal renderer, slash-command picker).
  - `src/app/api/agent-sessions/` — new API surface: create session, SSE stream,
    POST input, list/discover slash commands, signal refresh.
  - `src/components/app-sidebar.tsx` — add the entry point that opens the agent
    console.
  - Layout(s) — host the console panel so it's available in collective and
    per-project scope.
- **New server subsystem**: a session manager that spawns PTY-backed CLI
  processes, tracks them, pipes their I/O to SSE streams, and tears them down
  on disconnect/timeout. Lives server-side (Node runtime); no new external
  service.
- **Schema**: one new table, `agent_sessions` (id, projectId FK nullable for
  collective-scope sessions, agentName, cwd, status, pid, createdAt, endedAt,
  lastActivityAt). Sessions are ephemeral-by-default but persisted so a
  disconnected browser can resume (`resumeToken`).
- **Dependencies to add**: `node-pty` (real PTY for TUI agents), and an SSE
  helper (rolled thin or a tiny lib). No WebSocket framework. `execa` may be
  reused if `multi-project-collective-dashboard` adds it.
- **External**: the local CLI agent binaries on PATH (`pi`, etc.). No network
  egress introduced by the dashboard itself — the agents use their own
  configured providers.
- **Security**: this is a **local single-user launcher**, not a new trust
  boundary. The agent process inherits the dashboard user's privileges and runs
  in the user's own project directory; the agent's own safety nets (e.g. pi's
  command guard) apply unchanged. The dashboard binds to localhost by default;
  exposing it to a network would require explicit operator action and is
  out of scope for this change.
- **Relationship to other changes**: hard-depends on
  `multi-project-collective-dashboard` for `rootPath` and the collective scope;
  soft-depends on `build-openspec-dashboard-mvp`'s projection for the
  "displayed in UI" step (this change ships a refresh *trigger*; if projection
  is not yet wired, the trigger is a no-op that logs and the agent still works
  standalone).
