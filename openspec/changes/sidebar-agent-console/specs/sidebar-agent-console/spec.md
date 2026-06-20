## ADDED Requirements

### Requirement: Agent console sidebar

The dashboard SHALL provide an agent-console panel (sidebar) reachable from the
collective dashboard and from any single-project view. The panel hosts one or
more agent sessions, each a real local CLI agent process spawned server-side.
Opening the panel MUST NOT require leaving the current view; closing it MUST
NOT kill the underlying session (sessions persist until explicitly ended or
timed out).

#### Scenario: Open console without losing context

- **WHEN** the user opens the agent console while viewing a project's changes
- **THEN** the changes view remains visible and the console slides in beside
  it; closing the console returns the user to exactly the prior view.

#### Scenario: Closing the panel keeps the session alive

- **WHEN** the user closes the console panel while an agent session is running
- **THEN** the underlying process is NOT killed and reopening the panel resumes
  the session's stream where it left off.

### Requirement: Launch local CLI agent with project cwd

Each agent session SHALL be a real local CLI agent (e.g. `pi`) spawned
server-side with its working directory set to the active project root path (for
per-project scope) or to a collective-scope working directory (for collective
scope). The agent process MUST inherit the dashboard's user environment so its
configured providers, credentials, and PATH resolve exactly as in a terminal.

The roster of launchable agents SHALL be operator-configured and
PATH-detected; agents not on PATH MUST NOT appear as launchable.

#### Scenario: Launch pi in the enrolled project

- **WHEN** the user is viewing an enrolled project and starts a `pi` session
  from the console
- **THEN** `pi` is spawned with `cwd = <project rootPath>`, its environment is
  the dashboard user's environment, and its startup banner streams into the
  console.

#### Scenario: Unavailable agent is not offered

- **WHEN** `codex` is listed in config but not found on PATH
- **THEN** `codex` does not appear in the launchable-agents list and cannot be
  started.

### Requirement: Real-time stream (SSE + POST, Fusion-style)

Agent output (stdout, stderr, control events) SHALL stream from server to
client over Server-Sent Events, resumable by a session `resumeToken` so a
reconnected browser continues the stream rather than restarting the agent.
User input SHALL be sent via a POST endpoint that writes to the agent's PTY
input. The backing process MUST be a pseudo-terminal (PTY) so TUI agents
render correctly, not just line-buffered text.

#### Scenario: Stream an agent's output live

- **WHEN** an agent session is active and the console is open
- **THEN** the agent's output appears in the console in real time over SSE,
  including TUI rendering that matches a terminal.

#### Scenario: Resume after reconnect

- **WHEN** the browser disconnects and reconnects while a session is running
- **THEN** the client resumes the stream using `resumeToken` and the agent
  process is NOT restarted; the user sees subsequent output from the same
  session.

#### Scenario: Send input to the agent

- **WHEN** the user types into the console and submits
- **THEN** the input is written to the agent's PTY stdin and the agent reacts
  as if typed in a terminal.

### Requirement: Local slash-command discovery

When a session starts in a project, the console SHALL discover the agent's
available slash commands from that project's local configuration (e.g. pi's
`.pi/prompts/*.md` and the OpenSpec skills' commands, including the `opsx-*`
family). Discovered commands MUST render as a quick-pick list; selecting one
sends it to the agent exactly as if typed at the CLI prompt. Discovery MUST
reflect the project's own commands, not a global hardcoded list, so an enrolled
project's custom commands appear automatically.

#### Scenario: Discover opsx commands in an OpenSpec project

- **WHEN** a `pi` session starts in a project that has run `openspec init`
  (so `.pi/prompts/opsx-*.md` exist)
- **THEN** the console's command picker lists `/opsx-propose`,
  `/opsx-explore`, `/opsx-apply`, `/opsx-archive`, `/opsx-sync` alongside pi's
  own commands.

#### Scenario: Run a slash command from the picker

- **WHEN** the user selects `/opsx-propose` from the picker
- **THEN** the command is sent to the agent's PTY and the agent responds
  exactly as it would in a terminal (e.g. beginning the propose flow).

### Requirement: Changes land in the real project directory

Each session runs with its working directory set to the active project root
path. Any file the agent creates or edits SHALL be written directly into the
actual enrolled project on disk — the same directory the dashboard and
collective functionality already load. The dashboard MUST NOT copy, stage, or
redirect agent file writes to a separate location.

#### Scenario: Agent edit appears on disk in the project

- **WHEN** an agent session edits `openspec/changes/x/proposal.md`
- **THEN** the edit is present at `<project rootPath>/openspec/changes/x/proposal.md`
  on disk, with no staging copy involved.

### Requirement: UI refresh trigger after agent activity

The console SHALL provide a refresh trigger (automatic on agent-reported file
activity where the agent exposes it, and always available as a manual
"refresh project view" action) that asks the projection layer to re-parse the
project so the agent's changes render in the existing spec/change/task views.
This change owns only the trigger; the projection itself belongs to
`build-openspec-dashboard-mvp`. If projection is not yet wired, the trigger
MUST degrade gracefully (no-op + log) without breaking the agent session.

#### Scenario: Manual refresh after an agent edit

- **WHEN** the agent has finished writing a new change and the user clicks
  "refresh project view"
- **THEN** the project's changes view is re-read from disk and the new change
  appears in the UI.

#### Scenario: Graceful degradation when projection is absent

- **WHEN** the refresh trigger fires but the projection layer is not yet
  implemented
- **THEN** the trigger logs and returns a no-op; the agent session continues
  running and its output stream is unaffected.

### Requirement: Local single-user trust boundary

The agent console SHALL be a local single-user launcher, not a multi-user
trust boundary. The dashboard process MUST bind to localhost by default; binding to
a network interface MUST require explicit operator configuration and is out of
scope for this change. The agent process MUST inherit the dashboard user's full
privileges and run in the user's own project directories; the agent's own
safety nets (e.g. command guards) apply unchanged. The console MUST NOT add a
parallel permission system.

#### Scenario: Localhost binding by default

- **WHEN** the dashboard starts with no explicit bind configuration
- **THEN** the agent-console API endpoints are reachable only on localhost, not
  on external interfaces.

#### Scenario: Agent command safety comes from the agent, not the dashboard

- **WHEN** an agent attempts a destructive command that its own safety net
  blocks
- **THEN** the block surfaces in the console stream and the dashboard does not
  override or bypass it.
