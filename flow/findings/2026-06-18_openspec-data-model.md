# Findings — OpenSpec Data Model & CLI Surface

> Research synthesis of the OpenSpec project, derived from the upstream docs the user
> fetched (see references at the bottom). Purpose: ground the requirements + plan in what
> OpenSpec actually is, not what we guess it is.

## TL;DR

OpenSpec is a **spec-driven-development (SDD) tool** for AI coding assistants. It lives as
a per-repo `openspec/` directory of plain Markdown + YAML. The CLI (`openspec`) scaffolds,
validates, and archives artifacts. There is **no daemon, no server, no database** — the
filesystem is the source of truth and Git is the version system.

Implication for our server: we are building a **projection layer** over the filesystem, not
a replacement for it. Every entity maps 1:1 to files on disk; bidirectional sync is a hard
requirement, not a feature.

## Directory layout (per repo)

```
<repo>/
└── openspec/
    ├── config.yaml         ← project config: default schema, context block, per-artifact rules
    ├── specs/              ← source of truth (accepted requirements)
    │   └── <domain>/
    │       └── *.md        ← ### Requirement: + #### Scenario: blocks, RFC 2119 keywords
    ├── changes/            ← in-flight change proposals (not yet archived)
    │   └── <name>/
    │       ├── .openspec.yaml     ← metadata: schema, initiative, status
    │       ├── proposal.md        ← Intent, Scope, Approach
    │       ├── design.md          ← Technical Approach, Decisions, Data Flow, File Changes
    │       ├── specs/             ← DELTA specs: ADDED / MODIFIED / REMOVED / RENAMED
    │       └── tasks.md           ← hierarchical checkbox list (- [ ] 1.1 Do thing)
    ├── changes/archive/
    │   └── YYYY-MM-DD-<name>/     ← archived changes (delta specs already merged)
    ├── schemas/            ← project-local schemas (override built-in)
    │   └── <name>/
    │       ├── schema.yaml
    │       └── templates/...
    └── (workspaces, context stores — multi-repo coordination features)
```

## Artifact taxonomy

A **schema** defines which **artifacts** a change must produce, their dependencies, and the
templates that generate them. Built-in schema (`spec-driven`) ships 4 artifacts:

| Artifact   | Purpose                                | Sections                                       |
|------------|----------------------------------------|------------------------------------------------|
| proposal   | Why + what + scope                     | Intent, Scope (in/out), Approach               |
| design     | How (technical)                        | Technical Approach, Decisions, Data Flow, Files|
| specs      | Delta against main specs               | ADDED / MODIFIED / REMOVED / RENAMED           |
| tasks      | Implementation checklist               | hierarchical `- [ ] N.N` checkboxes            |

Schema fields per artifact (from `customization.md`):
- `generates` — output file path.
- `requires` — list of artifact IDs this one depends on (DAG).
- `apply.requires` — required at archive time.
- `apply.tracks` — tracked when merging deltas into main specs.

## Specs: the structured Markdown contract

A spec file under `specs/<domain>/*.md` is plain Markdown but has a parseable structure:

```markdown
# Spec: <Domain>

### Requirement: <Name>
The system SHALL ... (RFC 2119 keyword)
- **Scenario:** Given ... When ... Then ...
- **Scenario:** ...
```

Parsing rules (the OpenSpec parser, which we must mirror):
- `### Requirement:` opens a requirement block.
- `#### Scenario:` (or `- **Scenario:**`) opens a scenario.
- RFC 2119 strength verbs: SHALL, MUST, SHOULD, MAY, MUST NOT, SHALL NOT.
- An "orphan" requirement = a requirement referenced by a delta spec but not present in the
  main spec. Validation flags these.

## Delta spec grammar

A change's `specs/<domain>.md` contains delta sections. Each section header carries a verb:

- `## ADDED Requirement: <Name>` — new requirement to merge.
- `## MODIFIED Requirement: <Name>` — replaces the main-spec requirement of the same name.
- `## REMOVED Requirement: <Name>` — deletes it.
- `## RENAMED Requirement: <Old> → <New>` — renames.

Archive = apply these deltas to the main spec file, then move the change folder to
`changes/archive/YYYY-MM-DD-<name>/`.

## CLI command surface (must reach API/UI parity)

From `docs/commands.md` + `docs/cli.md`:

| Command                              | Effect                                                       |
|--------------------------------------|--------------------------------------------------------------|
| `openspec init`                      | Scaffold `openspec/` tree + `config.yaml`.                   |
| `openspec change new <name> -s <schema>` | Create `changes/<name>/` from schema template.          |
| `openspec change archive <name>`     | Merge deltas → main specs, move to archive.                  |
| `openspec validate [change]`         | Structural validation of a change or whole project.          |
| `openspec list specs` / `list changes` | Enumerate.                                                 |
| `openspec schema list` / `schema show <name>` | Enumerate / inspect schemas (built-in + local).   |
| `openspec schema fork <name>`        | Copy built-in schema into project-local `schemas/`.          |
| `openspec config edit`               | Open `config.yaml` in `$EDITOR`.                             |
| `openspec doctor`                    | Health-check the project structure.                          |
| `openspec workspace ...`             | Multi-repo coordination.                                     |
| `openspec context store ...`         | Shared context container management.                         |

`/opsx:verify` (slash command, not a CLI binary) is the AI-side verification loop:
**Completeness** (all tasks done, requirements implemented), **Correctness** (matches spec
intent), **Coherence** (design reflected in code). Outputs findings with CRITICAL / WARNING
/ SUGGESTION severity.

## Schema resolution precedence

When a schema is referenced, OpenSpec resolves in this order (first match wins):
1. Project-local: `openspec/schemas/<name>/`
2. User-level: `~/.local/share/openspec/schemas/<name>/`
3. Built-in (`spec-driven`, etc.) shipped with the CLI package.

This means our UI's schema browser must show **all three layers** and the resolution path.

## Workspace & context store (multi-repo)

- **Workspace** = a named coordination unit (`name` in kebab-case) that links multiple
  repos/folders with stable aliases and selects an "opener" tool. Backed by workspace-local
  guidance + agent skills.
- **Context store** = a shared container for cross-repo context. Holds **initiatives**
  (title + summary + status) that repo-local changes can link to. Used to drive a
  unified view of progress across repos.

These are the multi-project / cross-team primitives. They are *not* required for MVP but
shape the data model so we don't paint ourselves into a corner.

## What OpenSpec does NOT have (gaps we must fill)

1. **No tasks-as-data.** Tasks are checkboxes in Markdown. There is no task ID, assignee,
   label, due date, or status — only `- [ ]` vs `- [x]`. To get a Wekan/Vikunja-style board
   we must **layer metadata on top of the Markdown**, either via a sidecar file
   (`tasks.meta.json`) or via frontmatter, and never lose Markdown round-trip.
2. **No users / auth / RBAC.** Pure local CLI. Multi-tenancy is 100% our problem.
3. **No event/webhook system.** Filesystem + Git only.
4. **No search index.** Search must be built.
5. **No conflict detection** beyond `openspec validate`'s structural checks. Concurrent
   changes touching the same requirement are not detected at edit time.
6. **No real-time collaboration.** Last-write-wins via Git.

## Open architectural decisions (must be resolved in the plan)

- **Storage model**: DB-as-cache + filesystem-as-truth (recommended) vs. DB-as-truth +
  filesystem export. Decision affects everything below.
- **Task metadata sidecar format**: JSON vs YAML vs frontmatter vs. embedded HTML comments
  in the Markdown. Markdown round-trip fidelity is the constraint.
- **Sync strategy**: polling vs. filesystem watcher (inotify/FSEvents/chokidar) vs. Git
  hooks. Latency vs. complexity tradeoff.
- **Multi-user concurrency on the same repo**: optimistic locking (ETag/version) vs.
  pessimistic (lock file) vs. merge-on-conflict (Git PR style).
- **Schema YAML editor**: raw textarea + validate vs. visual form builder (e.g.
  react-jsonschema-form). Affects MVP scope materially.

## References (upstream)

- Repo: https://github.com/Fission-AI/OpenSpec
- README: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/README.md
- Concepts: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/concepts.md
- CLI: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/cli.md
- Workflows: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/workflows.md
- Customization (schemas): https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/customization.md
- Commands: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/commands.md
- Getting started: https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/getting-started.md

## References (local downstream)

- `flow/intentions/2026-06-18_openspec-management-server.md` — verbatim request.
- `flow/requirements/*.md` — derived requirements grouped by domain.
- `flow/plans/2026-06-18_openspec-dashboard-mvp.md` — phased plan.
