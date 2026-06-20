# openspec-dashboard

Management server + Kanban UI for [OpenSpec](https://github.com/Fission-AI/OpenSpec)
spec-driven development. Next.js (App Router) + Drizzle + PostgreSQL.

Public repo: https://github.com/buihongduc132/openspec-dashboard

## Quick start

```bash
cp .env.example .env.local      # set DATABASE_URL (and optionally REFERENCE_REPO_ROOT)
npm install
npm run dev                     # http://localhost:3000
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build (needs `DATABASE_URL`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` / `test:unit` | Unit tests (vitest) |
| `npm run test:integration` | Integration tests (vitest + testcontainers) |

See [`AGENTS.md`](./AGENTS.md) for the full product-direction index (intent,
findings, requirements, plan) and [`flow/`](./flow/) for the source-of-truth docs.

## Copy reference

Every entity in the dashboard — project, change, spec, spec-domain, requirement,
task, schema, context store, workspace, and initiative — exposes a **Copy
reference** control (a dropdown on detail headers / the kanban task dialog, and a
compact icon on list rows). It copies a structured, AI-agent-readable reference
in one click so you can hand work off to any coding agent (pi, Claude, Codex, …)
without retyping paths or metadata.

The reference is a *pointer* (type, title, absolute path, read instruction, scalar
metadata) — not a content dump — so the agent knows exactly which file(s) to read
and what to do. Absolute paths derive from each project's `rootPath` joined with
the OpenSpec-relative location; override the base for containerized agents with
the `REFERENCE_REPO_ROOT` env var (see [`.env.example`](./.env.example)).

### Two copy formats

Pick the format from the dropdown before copying:

- **Copy as Markdown** — a compact fenced block with the entity type as a heading,
  the title, a metadata list, the absolute path, and the read instruction. Best
  for pasting straight into a chat prompt.
- **Copy as JSON** — a single valid JSON object matching the payload structure
  (no trailing prose). Best for programmatic / tool input.

If the async Clipboard API is unavailable or rejected (older browsers, insecure
origins), the control falls back to a focused, pre-selected textarea with a
"Select all + ⌘C" hint instead of failing silently. A transient "Copied" state
confirms success; the fallback state never claims success.

### Reference API

The same payload is available read-only over HTTP, so future agent / deep-link
flows can fetch a fresh reference on demand:

```
GET /api/reference/{type}/{id}
```

- `200` — JSON body matching the reference payload structure.
- `400` — unsupported `type` (body names only the supported type taxonomy).
- `404` — entity `id` not found.

Supported `type` values: `project`, `change`, `spec`, `spec-domain`,
`requirement`, `task`, `schema`, `context-store`, `workspace`, `initiative`.
