# Findings — Entity Reference Capability (`entity-reference`)

> Feature note for the **Copy reference** capability introduced by OpenSpec change
> `copy-entity-reference`. Purpose: anchor the capability in `flow/` so agents reading
> `AGENTS.md` can locate what this feature is, how the payload is built, and which endpoint
> serves it. The authoritative requirement/scenario text lives in
> `openspec/changes/copy-entity-reference/specs/entity-reference/spec.md` until that spec
> graduates into `openspec/specs/`.

## TL;DR

Every dashboard entity (project, change, spec, spec-domain, requirement, task, schema,
context store, workspace, initiative) can emit a **structured, AI-agent-readable reference
payload** in one click. The payload is a *pointer* (type + title + absolute path +
read instruction + scalar metadata), not a content dump. It is produced by one canonical
builder and surfaced both as a UI "Copy reference" control and as a read-only API endpoint.

## Capability surface

- **Shared builder**: `src/lib/entity-reference/build.ts` → `buildEntityReference(type, row, ctx)`
  is the single source of truth for the payload. UI surfaces and the API both call it, so
  the copy and the HTTP response are guaranteed identical.
- **Two copy formats** (`src/lib/entity-reference/render.ts`): a compact **markdown** block
  for chat paste and a **JSON** object for tool input. The `CopyReferenceButton` dropdown
  lets the user pick before copying.
- **Read-only API**: `GET /api/reference/{type}/{id}` resolves an entity by type + id and
  returns the canonical payload as JSON. Contract:
  - `200` — payload matching the reference structure on success.
  - `400` — unsupported type (body names only the type taxonomy, no internal paths leak).
  - `404` — entity id not found (no internal paths in the error body).
- **Path resolution**: absolute paths derive from existing columns (`projects.rootPath`,
  change `name`, spec-domain `name`, task `taskNumber`, …) joined against a configured
  `REFERENCE_REPO_ROOT` base (defaults to the project's `rootPath`). Kinds with no file
  location (`schema`, `workspace`, `initiative`, …) use a `dashboard://` logical path and
  state in `readInstruction` that they live in the DB, not a file.
- **Clipboard fallback**: `src/lib/clipboard.ts` `copyText()` tries `navigator.clipboard`,
  then falls back to a focused + selected textarea so the feature works in every browser.

## Payload shape (D3)

```
{
  type, id, title, path, readInstruction,
  metadata: { status?, owner?, …perKind },   // optional keys omitted, never null
  generatedAt
}
```

## Supported entity types

`project`, `change`, `spec`, `spec-domain`, `requirement`, `task`, `schema`,
`context-store`, `workspace`, `initiative` — enforced by `isSupportedType()` in
`src/lib/entity-reference/supported-types.ts`, reused by both the route and the builder.

## Where it shows up in the UI

Kanban task dialog, project / change / spec-domain detail headers, per-requirement rows in
the spec-domain view, and a compact icon-only variant on every list row (projects, changes,
specs, schemas, context-stores, workspaces).

## Non-goals (carried over from the change design)

- No filesystem writes and no agent invocation — copy-only.
- No disk probing for paths; paths are derived from DB columns.
- No access control beyond what the app already enforces (currently local mode, no auth).
- `readInstruction` is English-only for v1.
