## Why

Dashboard users constantly hand off work to AI coding agents (pi, Claude, Codex, etc.). Today that handoff is manual: open a task/change/spec, eyeball its fields, then type a description like "look at change `add-auth` in project X, the spec is at `openspec/specs/...`, read `tasks.md`". This is lossy, slow, and error-prone — the agent frequently gets the wrong path or misses metadata (status, owner, due date). Every entity in the dashboard already knows its identity, location, and metadata; we should let the user copy a complete, structured reference in one click so any AI agent can locate and read the artifact itself.

## What Changes

- Add a **"Copy reference"** affordance to every entity surface in the dashboard: projects, changes, specs, spec domains, requirements, tasks, schemas, context stores, workspaces, and initiatives.
- The copied payload is a structured, AI-agent-readable reference containing, at minimum: entity **type**, **title/heading**, **absolute path** (or best-available location pointer), and **key metadata** (id, status, owner, timestamps, relationships).
- Provide the payload in **two copy formats** selectable via a small dropdown: (1) a compact **markdown block** for pasting into chat, and (2) a **JSON object** for programmatic/tool input.
- Add a new API endpoint that resolves an entity reference by id + type into its full reference payload (reusing existing DB reads), so the copy is authoritative and the same endpoint can power deep-link / "open in agent" flows later.
- Include a **read-instruction line** in every payload telling the agent exactly which file(s) to read and how (e.g., "Read `tasks.md` lines 1-40 then implement task 2").
- Show a lightweight **toast/confirmation** on successful copy and a graceful fallback (textarea + select-all) when the clipboard API is unavailable.

## Capabilities

### New Capabilities
- `entity-reference`: Generate and copy a structured, AI-agent-readable reference for any dashboard entity (project, change, spec, requirement, task, schema, context store, workspace, initiative), including type, title, absolute path, metadata, and a read instruction; served via a shared API endpoint and surfaced as a copy affordance on every entity detail/list surface.

### Modified Capabilities
<!-- No existing specs in openspec/specs/. This is the first spec in the project. -->

## Impact

- **Code**: New shared module `src/lib/entity-reference/` (payload builder + path resolver), new API route `src/app/api/reference/[type]/[id]/route.ts`, new client component `src/components/copy-reference-button.tsx`, toast/clipboard utility. Every entity page and the kanban task dialog gains the button.
- **APIs**: One new read-only GET endpoint `/api/reference/{type}/{id}` returning the reference payload as JSON. No existing endpoints change.
- **Dependencies**: None new — uses existing React, Next.js, Drizzle. Clipboard via `navigator.clipboard` with fallback.
- **Data**: No schema migrations. Path pointers are derived from existing columns (project `rootPath`, change `name`, spec domain `name`, task `taskNumber`, etc.) plus a configured repo-root base for absolute paths.
- **Systems**: None. Pure client + read-only server addition.
