## 1. Core reference builder

- [x] 1.1 Create `src/lib/entity-reference/types.ts` exporting `EntityType` union, `EntityReference`, and `ReferenceContext` (carries `repoRoot` base + relational lookups)
- [x] 1.2 Create `src/lib/entity-reference/paths.ts` with the path-resolution table (D8): pure functions per kind returning `{ path, readInstruction }` given the row + context; cover project, change, task, spec-domain, requirement, spec, schema, context-store, workspace, initiative
- [x] 1.3 Create `src/lib/entity-reference/build.ts` exporting `buildEntityReference(type, row, ctx)` assembling the canonical payload (flat identity fields + `metadata`, omitting nulls) per D3; add unit tests asserting the task/requirement/schema payloads
- [x] 1.4 Create `src/lib/entity-reference/render.ts` with `renderReferenceMarkdown(ref)` and `renderReferenceJson(ref)` (D4); unit test that JSON output parses back to the object and markdown contains type/title/path/readInstruction

## 2. API endpoint

- [x] 2.1 Create `src/app/api/reference/[type]/[id]/route.ts` GET handler: validate `type` against supported set (400 with taxonomy on miss), fetch row via existing Drizzle queries per kind, build context, return `buildEntityReference` result as JSON
- [x] 2.2 Return 404 JSON error body when the entity id is missing; ensure no internal paths leak in error messages
- [x] 2.3 Add a small validation helper `isSupportedType(x)` reused by route + builder

## 3. Copy control component

- [x] 3.1 Add clipboard + toast utilities to `src/lib/clipboard.ts`: `copyText(text)` trying `navigator.clipboard.writeText` and returning `{ ok, fallback }`; on fallback render a focused+selected textarea
- [x] 3.2 Create `src/components/copy-reference-button.tsx` (client): props `{ reference: EntityReference }`, holds `format` state (markdown|json), Radix DropdownMenu with two items + live payload preview textarea, calls `renderReference*` on open
- [x] 3.3 Wire clipboard fallback inside the component: if `copyText` reports `fallback`, switch the preview textarea to selectable mode and show "Select all + ⌘C" hint (spec: Clipboard fallback)
- [x] 3.4 Add transient confirmation state: "Copied" inline label + auto-dismiss ≤4s; on failure show "Manual copy" state, never claim success (spec: Copy confirmation)

## 4. Surface the button on entity views

- [x] 4.1 Kanban task dialog (`src/app/projects/[id]/kanban/_kanban-board.tsx` TaskDialog): build the task reference from the open task (needs changeName + project rootPath) and render `<CopyReferenceButton>`
- [x] 4.2 Project detail header (`src/app/projects/[id]/page.tsx`): add button using project row
- [x] 4.3 Change detail header (`src/app/projects/[id]/changes/[changeId]/page.tsx`): add button using change row + project rootPath
- [x] 4.4 Spec domain detail (`src/app/projects/[id]/specs/[domainId]/page.tsx`): add button for the domain and per-requirement buttons in the requirement list
- [x] 4.5 List pages — add a compact icon-only variant of the button to each row on: projects (`/projects`), changes (`/changes`), specs (`/specs`), schemas (`/schemas`), context-stores (`/context-stores`), workspaces (`/workspaces`)
- [x] 4.6 Ensure server pages pass already-fetched rows (no extra DB round-trips) into the client button as serialized `EntityReference`

## 5. Config + docs

- [x] 5.1 Read `REFERENCE_REPO_ROOT` env in the builder context (default to project `rootPath`); document in `.env.example`
- [x] 5.2 Update `AGENTS.md` flow reference + `flow/` note describing the entity-reference capability and the `/api/reference/*` endpoint
- [x] 5.3 Add a short usage note to README on the "Copy reference" feature and the two formats

## 6. Verification

- [x] 6.1 `npm run typecheck` passes
- [x] 6.2 `npm run lint` introduces no new errors in changed files
- [x] 6.3 `npm run build` succeeds with `DATABASE_URL` set
- [x] 6.4 Manual: open a task in kanban → copy markdown → paste confirms type/taskNumber/path/readInstruction present; copy JSON → parses to object; toggle fallback by disabling clipboard and confirm textarea appears
- [x] 6.5 Manual: hit `/api/reference/task/<id>` → 200 JSON; hit `/api/reference/unknown/x` → 400 taxonomy; hit `/api/reference/task/<bad>` → 404
