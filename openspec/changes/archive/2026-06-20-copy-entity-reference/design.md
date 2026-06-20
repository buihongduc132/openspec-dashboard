## Context

The dashboard already stores every entity (project, change, spec, requirement, task, schema, context store, workspace, initiative) in Postgres with stable ids, titles, and relational links (e.g. task → change → project → `rootPath`). The `rootPath` column on `projects` is the filesystem anchor that lets us derive absolute OpenSpec paths (`<rootPath>/openspec/changes/<name>/tasks.md`) without any new storage.

Today there is no copy affordance anywhere, and no shared "describe this entity to an agent" abstraction. Each page renders fields inline and the user manually re-types path guesses to AI agents. This change introduces a single shared **reference payload builder** + **reference API** + **copy button component**, reused across all surfaces.

Constraints: Next.js App Router (server components for data, client components for the copy button), Drizzle for reads, `navigator.clipboard` with a textarea fallback. No schema migrations, no new runtime dependencies.

## Goals / Non-Goals

**Goals:**
- One canonical payload builder (`buildEntityReference`) so all surfaces (list rows, detail headers, kanban dialog) and the API endpoint produce identical output.
- Absolute, agent-readable paths derived purely from existing columns + a configured repo-root base.
- Two copy formats (markdown + JSON) chosen from one control.
- A read-only `/api/reference/{type}/{id}` endpoint authoritative enough to power deep-link/"open in agent" flows later.
- Graceful clipboard fallback (textarea + select-all) so the feature works in every browser.

**Non-Goals:**
- Writing to the filesystem or invoking the agent — this is copy-only.
- Auto-discovering file paths by scanning disk; paths are derived from DB columns, not probed.
- A diff/patch format or a full entity dump (full bodies) — the payload is a *pointer* plus metadata, not the content itself.
- Auth/access control on the reference endpoint beyond what the app already enforces (currently local mode, no auth).
- Internationalizing the `readInstruction` text (English only for v1).

## Decisions

### D1: Single builder module, not per-page logic
**Decision:** One `src/lib/entity-reference/build.ts` exports `buildEntityReference(type, row, context)` returning the canonical payload. Pages and the API both call it.

**Why:** Avoids drift between the UI copy and the API response (the spec requires them to match). Per-page builders would duplicate the path-resolution rules and guarantee divergence.

**Alternatives considered:** Per-page inline builders (rejected — drift), or building payload only in the API and having the UI fetch+copy (rejected — adds a round-trip and a loading state to a one-click action; the page already has the row data).

### D2: Repo-root base via env, not per-project column
**Decision:** Absolute paths join a configured base (`REFERENCE_REPO_ROOT`, defaulting to the project's `rootPath`) with the OpenSpec-relative location. When a project's `rootPath` is already absolute, use it directly.

**Why:** Projects store `rootPath` which may be absolute (local dev) or relative (registered from elsewhere). One env knob lets ops normalize, while defaulting to `rootPath` keeps zero-config for the common case.

**Alternatives:** Add a `repoRoot` column (rejected — migration for no behavioral gain), always assume relative (rejected — breaks local dev where `rootPath` is absolute).

### D3: Payload shape — flat-ish with nested `metadata`
**Decision:**
```
{
  type, id, title, path, readInstruction,
  metadata: { status?, owner?, ...perKind },
  generatedAt
}
```
Flat identity fields (`type`, `id`, `title`, `path`, `readInstruction`) are constant across kinds; `metadata` carries kind-specific fields. Optional fields are omitted when absent (never `null`).

**Why:** Agents parse flat fields reliably; grouping the variable bits under `metadata` keeps the contract stable while letting kinds enrich it. Omitting nulls keeps payloads small and avoids `if (x !== null)` noise in agent prompts.

**Alternatives:** Fully flat with prefixed keys (rejected — noisy, kind-dependent key set), fully nested (rejected — agents handle one level of nesting well but not deep).

### D4: Two formats from one builder
**Decision:** Builder returns the **object**; two renderers — `renderReferenceMarkdown(ref)` and `renderReferenceJson(ref)` — produce the copy strings. The `CopyReferenceButton` holds the selected format in local state.

**Why:** Single source of truth (the object); formats are pure presentation. Adding a third format later (e.g. YAML, a shell `cat` command) is additive.

**Alternatives:** Generate only markdown (rejected — spec requires JSON too), build both eagerly (rejected — wasteful).

### D5: API as a thin resolver
**Decision:** `/api/reference/[type]/[id]/route.ts` does only: validate `type` against the supported set → fetch the row (reusing existing Drizzle queries) → call `buildEntityReference` → return JSON. Path param parsing via Next.js dynamic routes.

**Why:** Keeps the builder reusable by both server (API) and client (page already has the row). The endpoint is the contract surface for future agent integrations.

**Alternatives:** Make the API the only producer and have pages fetch (rejected — D1 reasoning).

### D6: Clipboard fallback strategy
**Decision:** Try `navigator.clipboard.writeText`; on `undefined` or rejection, render a hidden `<textarea>` containing the payload, focus + select it, and flip the control to "manual copy" state with a hint. Never throw.

**Why:** Non-HTTP contexts (older Safari, insecure-origin iframes) still need to work. The textarea fallback is the standard robust pattern.

**Alternatives:** `document.execCommand('copy')` (deprecated, flaky), or no fallback (rejected — spec requires fallback).

### D7: Copy control is a dropdown, not two buttons
**Decision:** One `CopyReferenceButton` that opens a small Radix DropdownMenu with "Copy as Markdown" / "Copy as JSON" + a live preview of the payload.

**Why:** Keeps surfaces uncluttered (one control per entity) while exposing both formats. The preview doubles as the manual-copy textarea target in fallback mode.

**Alternatives:** Two buttons (rejected — visual noise on dense list rows), a separate settings toggle for default format (deferred — YAGNI for v1).

### D8: Path resolution table (authoritative)
| Kind | Path | readInstruction basis |
|---|---|---|
| project | `<rootPath>` | "This is project `<name>`, OpenSpec root at `<path>`." |
| change | `<rootPath>/openspec/changes/<name>` | "Read `proposal.md`, `design.md`, `tasks.md` in this change dir." |
| task | `<rootPath>/openspec/changes/<changeName>/tasks.md` | "Find task `<taskNumber>` and implement it." |
| spec-domain | `<rootPath>/openspec/specs/<domainName>` | "Read the spec(s) in this domain dir." |
| requirement | `<rootPath>/openspec/specs/<domainName>/spec.md` | "Find requirement `<title>`." |
| spec | `<rootPath>/openspec/specs/<domainName>/spec.md` | "Read this spec." |
| schema | `dashboard://schema/<id>` | "Stored in dashboard DB; retrieve via `GET /api/schemas`." |
| context-store | `dashboard://context-store/<id>` | "Stored in dashboard DB at path `<contextStores.path>`." |
| workspace | `dashboard://workspace/<id>` | "Stored in dashboard DB." |
| initiative | `dashboard://initiative/<id>` | "Stored in dashboard DB." |

Kinds with a `dashboard://` logical path explicitly state in `readInstruction` that the entity lives in the dashboard database, not a file, so the agent does not attempt a file read that cannot succeed.

## Risks / Trade-offs

- **[Path drift]** Project `rootPath` may not match the agent's actual filesystem view (e.g. agent runs in a container, dashboard on host). → `readInstruction` always includes the resolved absolute path verbatim so the agent can reconcile; `REFERENCE_REPO_ROOT` env lets ops override. Document this in the README.
- **[Stale metadata]** The page-rendered payload is a snapshot at render time; if the entity changes, the copied ref is stale. → Acceptable for a copy action (it's a point-in-time handoff). The API endpoint always returns fresh data, so future agent flows should prefer the API.
- **[Clipboard permission prompts]** Some browsers prompt for clipboard permission on first use. → Fallback path handles rejection; toast clarifies if manual copy is needed. No way to avoid the prompt entirely.
- **[Large payloads from requirement bodies]** If we naively include full `body` text, payloads balloon. → Decision: `metadata` carries only scalar fields (status, owner, numbers, titles, dates), never free-text bodies. Bodies are reachable via the `path`, not inlined.
- **[New endpoint attack surface]** `/api/reference/*` is read-only but lists supported types in 400 errors. → 400 body names only the type taxonomy, no internal paths. Acceptable in local mode; revisit when auth lands (req 09).
