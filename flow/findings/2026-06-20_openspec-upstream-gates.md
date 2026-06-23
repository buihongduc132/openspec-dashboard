# Finding — Upstream Format Empirical Gates (§0.1)

> OpenSpec change **phase0-foundations** — *§0.1 Empirical upstream-format gates*
> (req 08 §8.9). Per design decision **D0-5**, the `SIDECAR_LOCATION` constant
> is a single switchable value whose correct default is determined empirically by
> **Gate 1** below; if Gate 1 fails, the constant flips to the fallback path
> (`.openspec-dashboard/`) and this finding records that fact. Each gate below
> produces a **binary outcome** recorded in its section.

## TL;DR

| Gate | Subject                          | Outcome   |
|------|----------------------------------|-----------|
| 1    | Sidecar coexistence (`openspec validate` ignores sidecar dir) | **PASS** — `openspec/.dashboard/` ignored by v1.4.1 |
| 2    | Workspace format (actual upstream format)        | **CONFIRMED** — `workspaces/registry.yaml`, `{version:1, workspaces:{name→root}}` |
| 3    | Context-store format (actual upstream format)    | **CONFIRMED** — `context-stores/registry.yaml` + `.openspec-store/store.yaml`, git backend |
| 4    | Schema-fork provenance (actual upstream format)  | **CONFIRMED** — copied schema dir under `openspec/schemas/<name>/`, NO `schema-forks.json` |
| 5    | Parser source retrieval (npm install / de-bundle)| _TBD by Gate 4 task_ |

---

## Gate 1: Sidecar Location Coexistence

**Question:** Does `openspec validate` traverse / flag files under the sidecar
directory (`openspec/.dashboard/`)? The dashboard must be able to write private
state into a sidecar directory **without** tripping the upstream OpenSpec
validator.

**Pre-committed fallback (D0-5):** If Gate 1 fails for `openspec/.dashboard/`,
the `SIDECAR_LOCATION` constant flips to `.openspec-dashboard/` (a top-level
directory outside `openspec/`), and Gate 1 is re-run against that path.

**Method:** A fixture OpenSpec repo is constructed with a valid change plus a
planted sidecar file under the candidate sidecar path. `openspec validate`
(out-of-the-box, upstream tooling v1.4.1) is run; the assertion is **zero
findings reference the sidecar directory**. The result is written to the
`SIDECAR_LOCATION` constant in `src/lib/projection/sidecar.ts`.

**Result:** **PASS** (2026-06-23, OpenSpec v1.4.1). A fixture repo with files
planted under `openspec/.dashboard/` (`test-state.json`, `notes.txt`) was
validated via `openspec validate --all --json`. The validator enumerated the
real specs/changes (entity-reference, multi-project-dashboard, phase0…4,
testing-standard) and produced **zero findings referencing the sidecar
directory**. The only `"dashboard"` token in the JSON output was the
`multi-project-dashboard` spec id, not the sidecar path. The sidecar dir is
invisible to the upstream validator.

**Constant value chosen:** `openspec/.dashboard/` (the default). The fallback
(`.openspec-dashboard/`) is NOT required — no flip performed.

---

## Gate 2: Workspace Format

**Question:** What is the actual on-disk format of an upstream OpenSpec
**workspace** (the `openspec/` layout, `config.yaml` schema, project structure)?
The projection must round-trip the real format, not an invented one.

**Source:** Upstream package `@fission-ai/openspec@1.4.1` (the npm-distributed
OpenSpec CLI), `dist/core/workspace/registry.d.ts` + `.js`, read directly.
The published package ships TypeScript declaration files (`.d.ts`) alongside
the bundled `.js`, so the format is confirmable from the public type surface
without unbundling minified source.

**Result:** **CONFIRMED — obtainable.** The upstream workspace registry lives
in a **global data dir** (resolved via `getGlobalDataDir()`, XDG-style), under:

- directory: `workspaces/` (`MANAGED_WORKSPACES_DIR_NAME = "workspaces"`)
- registry file: `workspaces/registry.yaml` (`WORKSPACE_REGISTRY_FILE_NAME`)

The `registry.yaml` schema is:

```yaml
version: 1
workspaces:
  <name>: <workspaceRoot>   # Record<string, string>: name -> absolute root
```

`WorkspaceRegistryState = { version: 1, workspaces: Record<string, string> }`.
A workspace is therefore a named pointer to a project root, stored globally
(outside any single repo), not in-tree. The projection does NOT need to defer
this to Phase 3a — the format is fully documented by the public type surface.

---

## Gate 3: Context Store Format

**Question:** What is the actual format of the upstream OpenSpec **context
store** (the per-change context/cache state the dashboard may need to mirror or
respect)?

**Source:** Upstream package `@fission-ai/openspec@1.4.1`,
`dist/core/context-store/foundation.d.ts` + `registry.d.ts`, read directly.

**Result:** **CONFIRMED — obtainable.** The upstream context store lives in a
**global data dir** and is git-backed. Layout:

- stores directory: `context-stores/` (`CONTEXT_STORES_DIR_NAME`)
- registry file: `context-stores/registry.yaml` (`CONTEXT_STORE_REGISTRY_FILE_NAME`)
- per-store metadata dir (inside the store root): `.openspec-store/`
  (`CONTEXT_STORE_METADATA_DIR_NAME`)
- per-store metadata file: `.openspec-store/store.yaml`
  (`CONTEXT_STORE_METADATA_FILE_NAME`)

Registry schema (`ContextStoreRegistryState`):

```yaml
version: 1
stores:
  <id>:
    backend:
      type: git
      local_path: <path>
      remote: <url>     # optional
      branch: <branch>   # optional
```

Metadata schema (`ContextStoreMetadataState`):

```yaml
version: 1
id: <id>
```

The context store is a registered, git-backed working copy pointer. The format
is fully documented by the public type surface; no deferral to Phase 3a is
required for the projection to round-trip it.

---

## Gate 4: Schema Fork Provenance

**Question:** What is the actual provenance / format of an upstream OpenSpec
**schema fork** (the `.dashboard/schema-forks.json` artifact referenced by the
schema-fork capability)? The dashboard must not invent a format the upstream
does not recognize.

**Source:** Upstream package `@fission-ai/openspec@1.4.1`,
`dist/commands/schema.js` (the `openspec schema fork` command) +
`dist/core/artifact-graph/resolver.js` (`getProjectSchemasDir`, `getSchemaDir`,
`getSchemaResolution`), read directly.

**Result:** **CONFIRMED — and corrects an in-repo assumption.** The upstream
schema-fork mechanism is `openspec schema fork <source> [name]`, which **copies
an existing schema directory** into the project-local schemas dir and rewrites
its `schema.yaml` `name` field. There is **no `schema-forks.json` manifest** —
a fork is materialized as a full schema directory, indistinguishable at
resolution time from a hand-authored project schema.

Fork destination + resolution order (`getProjectSchemasDir` / `getSchemaDir`):

1. **Project-local:** `<projectRoot>/openspec/schemas/<name>/schema.yaml`
   (forks land here)
2. **User override:** `${XDG_DATA_HOME}/openspec/schemas/<name>/schema.yaml`
3. **Package built-in:** `<package>/schemas/<name>/schema.yaml`

```text
<projectRoot>/openspec/schemas/<forked-name>/
  schema.yaml      # name: <forked-name>
  templates/
    proposal.md
    design.md
    tasks.md
    spec.md
```

**Provenance signal:** the only way to know a project-local schema is a *fork*
(rather than original) is the `getSchemaResolution(...).source` value returned
by the resolver (`'project'` vs `'user'` vs `'package'`); there is **no
`schema-forks.json`** and no separate provenance file upstream.

**⚠ Correction to in-repo code:** `src/lib/schemas/fork.ts` and its test assert
provenance is recorded in `openspec/.dashboard/schema-forks.json`. That is NOT
the upstream format. The dashboard's schema-fork feature must be reconciled to
the upstream "copied directory under `openspec/schemas/<name>/`" model (a
Phase 1 schema-fork task; out of scope for this gate beyond recording the
finding). No `schema-forks.json` should be invented as an upstream contract.

---

## Gate 5: Parser Source Retrieval

**Question:** Can the upstream OpenSpec **parser source** be retrieved (NFR-5)?
`npm install openspec` is the preferred path; if the source is bundled /
unavailable, the parser is re-implemented from documentation (D0-1) and the
unrecoverable constructs are seeded into the **NFR-5 gap registry**.

**Method:** Attempt `npm install openspec` and/or clone + de-bundle the upstream
package; record exactly what source was obtainable; populate the initial
gap-registry entries from the result.

**Source:** `npm view openspec`, the globally-installed
`@fission-ai/openspec@1.4.1` package (`/home/bhd/.local/share/mise/installs/node/22.22.2/lib/node_modules/@fission-ai/openspec`),
and its `dist/core/parsers/` tree.

**Result:** **PARTIAL — bundled-but-readable; original TS source unavailable.**

1. **`npm install openspec` is NOT the real tool.** The npm package `openspec`
   is an unrelated 1.3 kB placeholder (`openspec@0.0.0`, maintainer `akerust`,
   published >1 year ago, `unpackedSize: 1.3 kB`). Installing it yields nothing
   usable. The real OpenSpec CLI is published as **`@fission-ai/openspec`**
   (homepage `https://github.com/Fission-AI/OpenSpec`), installed globally here
   via mise.

2. **`@fission-ai/openspec@1.4.1` ships bundled-but-readable output.** The
   published package contains only the `dist/` build (ESM `.js`), **not** the
   original TypeScript sources. Crucially, the `.js` is **bundled but NOT
   minified** — class names, method names, and control flow are intact (e.g.
   `dist/core/parsers/markdown-parser.js` is 226 readable lines with the full
   `MarkdownParser` class). `.d.ts` declaration files document the entire public
   grammar surface (`Spec`, `Requirement`, `Scenario`, `Delta`, `Section`,
   `DeltaPlan`).

3. **No source maps for the runtime JS.** Only `.d.ts.map` files ship (pointing
   at the declaration files themselves); there is no `*.js.map`, so the original
   `.ts` cannot be reconstructed. The bundled readable `.js` is the closest
   available artifact.

**Decision impact (D0-1):** the parser is re-implemented from **documentation**
regardless, per D0-1. The readable bundled `.js` + `.d.ts` are used as a
*cross-check* against the documented grammar (to confirm/deny rule coverage),
never as a copy-paste source. Constructs that cannot be confirmed from the
documentation NOR the public type surface are seeded into the gap registry
below.

**Gap-registry seed (initial NFR-5 entries, populated 2026-06-23):**

These are upstream OpenSpec constructs whose exact behavior could NOT be fully
confirmed from documentation or the public `.d.ts` type surface, and so are
tracked as gaps for the in-tree parser (D0-1). The gap-registry implementation
lands in task 3.5 (`src/lib/openspec-parser/gap-registry.ts`); these are its
seed entries.

1. **`tasks.md` checkbox grammar is NOT an upstream parser concern.**
   Upstream `dist/core/parsers/` ships `markdown-parser`, `change-parser`,
   `requirement-blocks`, and `spec-structure` — there is **no dedicated
   `tasks.md` checkbox parser** in upstream core. Checkbox state is managed by
   the apply workflow, not a parseable grammar. The in-tree parser (task 3.4)
   therefore defines the `- [ ]` / `- [x]` / `- [X]` verbatim-marker grammar
   itself per INV-2; this is a documented divergence, recorded as gap
   `tasks-checkbox-grammar-not-upstream`.

2. **`REMOVED` delta carries only names upstream, not `{Reason, Migration}`.**
   Upstream `DeltaPlan.removed: string[]` is a list of requirement names. The
   structured `**Reason**` + `**Migration**` fields required by this change's
   spec (delta grammar scenario) are a stricter contract than upstream models.
   The in-tree parser enforces the stricter contract (task 3.3) and records the
   upstream mismatch as gap `removed-reason-migration-not-upstream-modeled`.

3. **`RENAMED` `FROM:`/`TO:` shape.** Upstream models `renamed` as
   `Array<{ from: string; to: string }>`. The exact Markdown line shape
   (`FROM:` / `TO:` markers) is confirmable from the readable `.js` but not from
   a documented rule; tracked as gap `renamed-from-to-marker-shape` until the
   corpus tests (task 3.1) pin it.

4. **Front-matter / unknown block shapes.** Any front-matter key or block shape
   outside the documented Spec/Requirement/Scenario/Delta grammar is, by
   construction, unconfirmed and appends to the registry at parse time (NFR-5
   scenario "Unknown construct recorded, not crashed"). No static seed beyond
   the runtime-discovery rule.

These four entries are the initial registry contents; the registry grows at
runtime as the corpus (task 3.1) and real repos exercise the parser.

---

## Reproducibility

Each gate's method section above is executable. Re-run commands are recorded in
the gate's result section once the empirical step lands.
