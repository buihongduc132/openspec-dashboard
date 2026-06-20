## Context

Phase 1 delivers a usable single-project MVP: default-column kanban, single-archive, spec read/propose, schema read/validate. Phase 2 pushes the dashboard to Wekan/Vikunja parity *within a single project* and closes the conflict-detection gap from requirement-level (06.4a) to file-level (06.4b) at archive time. This is a large UI + business-logic phase that adds five capabilities: rich tasks, rich changes (archive/sync/restore), spec history/export, schema authoring (raw YAML), and the heuristic verifier. The design must respect the invariants (INV-1..INV-9), the Authority Contract, and the existing decisions (D-TaskID, D-ReqID, D-ArchiveSeq, D-Verify, D-SchemaEditor).

The codebase is Next.js 16 (App Router) + Drizzle + Postgres + React 19 + Tailwind 4 + Radix/shadcn. All code in this phase follows the project's `testing-standard` capability (TDD-first, coverage gates, no dead code) — cited by reference, not restated here.

## Goals / Non-Goals

**Goals:**
- Deliver Wekan/Vikunja-parity task management (swimlanes, deps, comments, sub-checks, list/calendar, bulk ops, real-time updates).
- Implement file-level conflict detection (06.4b) and a robust bulk-archive flow with topological ordering and the per-project mutex.
- Provide spec version history (git-backed) and export (md/pdf/json).
- Enable schema authoring (create/fork/template/activate/export-import) using a raw YAML editor.
- Ship the heuristic verification tier (completeness/correctness/coherence) and a validation dashboard.

**Non-Goals:**
- **Authentication / RBAC / Multi-user identity** — Phase 3a. Phase 2 simulates multi-user only for real-time/concurrent-edit testing (e.g., multiple sessions/tokens), but does not implement login.
- **Visual schema editor (drag-drop form builder)** — Phase 3b per D-SchemaEditor. Phase 2 ships a raw YAML editor with live validation only.
- **LLM-augmented verification** — Phase 3b. Phase 2 is pure heuristics (D-Verify).
- **Cross-repo / multi-project consistency** — Phase 3a (req 06.5) and the `multi-project-collective-dashboard` change. Phase 2 is strictly single-project.
- **External integrations** (git auto-PR, webhooks, agent API) — Phase 3b.

## Decisions

### D1: `@dnd-kit` for all drag-and-drop (board, calendar, list)
**Decision:** Use `@dnd-kit/core` + `@dnd-kit/sortable` for kanban card DnD, calendar drag-reschedule, and list-view reorder.

**Why:** `@dnd-kit` is accessible (keyboard support out of the box, critical for NFR-9 WCAG 2.2 AA Dragging Movements), lightweight, and supports the 2D grid (swimlanes × columns) via sensors + collision detection. It avoids the heavyweight `react-beautiful-dnd` (unmaintained) and custom DOM manipulation (inaccessible).

**Alternatives considered:**
- `react-dnd` — More flexible but requires manual accessibility wiring; `@dnd-kit` has better defaults.
- Native HTML5 drag-and-drop — No touch support, poor accessibility; would violate NFR-9.

### D2: Server-Sent Events (SSE) for real-time board updates
**Decision:** Implement real-time updates via SSE on a dedicated route (`/api/projects/[id]/events`). The server pushes card-move/edit events to subscribed clients within 2s. Falls back to polling (every 5s) if SSE fails.

**Why:** SSE is one-way (server→client), which is all we need for board updates. It works over standard HTTP, is simpler to scale than WebSockets, and integrates cleanly with Next.js API routes. WebSockets are overkill for this read-heavy pattern.

**Alternatives considered:**
- WebSockets — Bidirectional, but adds connection-management complexity we don't need.
- Polling only — Violates the <2s update requirement (NFR-6 spirit) and wastes bandwidth.

### D3: `diff-match-patch` for the concurrent-edit 3-way merge UI
**Decision:** Use Google's `diff-match-patch` library to perform 3-way merges (yours / theirs / parent) on section text when a 409 conflict occurs.

**Why:** INV-7 requires per-section ETags. When a conflict happens, the user must resolve it manually. `diff-match-patch` is battle-tested, fast, and operates on the raw Markdown text of the conflicting section. It avoids reinventing a diff engine.

**Alternatives considered:**
- Structured AST merge — More accurate for Markdown, but extremely complex and fragile. Text-level diff is sufficient for the section granularity defined in the Section Granularity Table.
- `jsdiff` — Slower and less ergonomic API for 3-way merges than `diff-match-patch`.

### D4: Topological sort + per-project mutex for Bulk Archive
**Decision:** Bulk archive acquires the existing per-project archive mutex (established in Phase 1 for single archive). It computes a topological order of the selected changes based on inter-change dependencies (A ADDS R that B MODIFIES → A first). Tie-breaks lexicographically on change name. Cycles are rejected. The entire batch runs inside the mutex; file-level conflicts (06.4b) are checked against the *evolving* main-spec per-file SHA-256 hash before each change applies. "File-level" means per-file granularity: a conflict is flagged when two changes both modify the same spec-domain file (`openspec/specs/<domain>.md`), even if they touch different sections within that file. This is coarser than INV-7's per-section ETag (which governs concurrent editing) by design — file-level conflict detection at archive time is a safety net against structural drift, not a concurrency primitive. Bulk archive is atomic: if any change in the batch fails (conflict, validation error, timeout), all archives in the batch are rolled back and no main-spec writes persist.

**Why:** INV-4a and D-ArchiveSeq demand strict ordering and atomicity. Holding the mutex for the whole batch prevents intermediate states where another archive could interleave. Evolving-hash checking catches file-level drift that emerges *during* the batch (e.g., change A's archive modifies a file that change B expected untouched).

**Alternatives considered:**
- Independent transactions per change (no global order) — Leads to non-reproducible final main-spec state; violates the deterministic tie-break AC in req 03.14.
- File-level locking — Too granular, prone to deadlocks across changes.

### D5: Heuristic verifier as a pure TypeScript AST/keyword engine
**Decision:** Implement the completeness/correctness/coherence checks as pure TypeScript functions operating on the parsed AST of delta specs, `tasks.md`, and `design.md`. No LLM calls.

**Why:** D-Verify explicitly states this is `/opsx:verify`-*inspired*, not parity. Deterministic heuristics (keyword overlap, RFC-2119 strength extraction, scenario-step counting) are fast, cacheable, and predictable. They run in-process without external API latency or cost.

**Alternatives considered:**
- External microservice — Unnecessary network overhead for pure logic.
- LLM tier — Explicitly deferred to Phase 3b.

### D6: Raw YAML editor with live validation for Schema Authoring
**Decision:** Schema authoring (create/fork/edit templates) uses a raw YAML editor (CodeMirror/Monaco with YAML mode) with live validation feedback. No visual drag-drop form builder.

**Why:** D-SchemaEditor explicitly defers the visual editor to Phase 3b. Raw YAML with live validation is sufficient for the Phase 2 authoring requirements and avoids building a UI that will be redesigned in Phase 3b.

**Alternatives considered:**
- Basic `<textarea>` — No syntax highlighting, poor UX for complex schemas.

### D7: Git operations via `simple-git` for spec history and archive commits
**Decision:** Use `simple-git` (lightweight Node.js wrapper for git CLI) for `git log`, `git blame`, and archive commits.

**Why:** `simple-git` provides a typed, promise-based API over the git binary, avoiding shell-injection risks and parsing fragility. It's already a common dependency in Node ecosystems.

**Alternatives considered:**
- `isomorphic-git` — Pure JS, but doesn't respect user's `.gitconfig`/SSH keys easily; `simple-git` uses the system git which is already configured.

## Risks / Trade-offs

- **[Large board performance]** Boards with >500 tasks could lag during DnD and SSE updates. → Mitigation: Virtualize the board columns and swimlanes using `react-window`; document a soft-limit and test with 1000-task fixtures (NFR-2).
- **[3-way merge produces invalid Markdown]** `diff-match-patch` operates on text and might merge two Markdown sections into syntactically broken Markdown. → Mitigation: Run the merged result through the validator before accepting; if invalid, fall back to manual text selection in the UI and warn the user.
- **[Bulk archive deadlock/mutex starvation]** A slow git commit inside the bulk-archive mutex could block all other archives on that project. → Mitigation: Mutex has a configurable timeout (default 30s); on timeout, the batch fails loudly with a clear error, and no partial state is committed.
- **[SSE connection limits]** Browsers limit concurrent SSE connections per domain (historically 6). → Mitigation: Multiplex project events over a single SSE connection per browser tab; fall back to polling if the connection is rejected.
- **[Heuristic false positives]** Keyword-overlap correctness checks may flag legitimate mismatches or miss semantic gaps. → Mitigation: Heuristics are advisory (warnings/suggestions) unless `verify.required: true`; findings include the rationale so users can dismiss false positives (recorded in audit log).
