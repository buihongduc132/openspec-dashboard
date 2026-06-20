# Run Audit — build-openspec-dashboard-mvp

## Dispatch 1 — 2026-06-20 16:38 (this iteration)
- Workflow: `openspec-apply` (archon-configuration), provider pi (bhd-litellm/role-smart)
- **Run-id: `eab2c8757f3f816f097ee09c8a6fbc33`** ← authoritative handle (CLI dispatch)
- Trigger: `archon workflow run openspec-apply "<repo> <change>" --cwd archon-configuration` (backgrounded via nohup, PID 3371931, log `/tmp/openspec-apply-build-mvp/run.log`)
- Target: `/home/bhd/Documents/Projects/bhd/openspec-dashboard` change `build-openspec-dashboard-mvp`
- Resume point: task 27 (1.7 OpenSpec parser port) — 26/67 done at dispatch
- Pre-flight verified: no active/zombie runs; Archon REST health ok
- Status: EXECUTING (discover-change node completed 2102ms; DAG 18 nodes/17 layers flowing)
- Worktree: `task-openspec-apply-1781973492189`

## Dispatch-path finding (IMPORTANT)
- First attempt via REST (`archon_run_workflow` MCP tool) created conversation `e50c491a`
  (`platform_type=web`) but did NOT execute — 0 messages, no workflow_runs row.
- **REST/web dispatch does not execute workflows on this Nomad deployment.**
  Only `archon` CLI dispatch (`platform_type=cli`) spawns a local worker that runs the DAG.
  All future OPS dispatches MUST use the CLI path. CA recorded.

## Next iteration
- Monitor run `eab2c875` (`archon workflow status` / DB events) → when PR auto-created
  → pr-review-cycle → merge → LOCAL sync → append PR# + merge SHA here.

## 2026-06-21 — Run eab2c875 ZOMBIE (cleaned)

- Run `eab2c8757f3f816f097ee09c8a6fbc33` (CLI dispatch, openspec-apply) **ZOMBIED**.
- implement-task node stalled after `npm run test` tool call at 16:43:46. Last event 16:44:06; ~8h later no live PID (pgrep=0). Flipped status→`failed` via SQL (zombieCleanedAt recorded).
- Partial work stranded untracked: `src/lib/openspec-parser/{types.ts,rules.ts,openspec-parser.test.ts}` (645 lines). Task 1.7 INCOMPLETE — missing `index.ts` barrel (`@/lib/openspec-parser` import unresolvable, test fails at import).
- **Finding (SUPERSEDED — see CORRECTION below)**: CLI dispatch ALSO unreliable on this Nomad deploy (matches REST dead-conversation pattern). Both dispatch paths degrade to zombies. Root cause not yet diagnosed (idle_timeout expiry vs OOM vs node crash).
- build-mvp stays 26/67. Task 1.7 re-attempts on next dispatch.

## 2026-06-21 — CORRECTION: zombie = idle_timeout on stalled LLM stream (NOT dispatch-path bug)

Evidence-based re-diagnosis (DB events for run `eab2c875`):
- 22 `tool_called` / 21 `tool_completed` — **all tool calls returned**; no dangling bash/test.
- Last real activity: `tool_completed write @ 16:44:06`. Next tool call never fired.
- `completed_at = 17:12:33` = **+28min after last activity** = exactly the implement-task node `idle_timeout: 1800000` (30min).
- pi provider session (bhd-litellm/role-smart) went **idle mid-iteration**: the model stream stalled, emitted no further tool calls → idle_timeout killed the node → run→`failed`.

**Corrected root cause**: transient upstream LLM-stream stall, NOT a systemic REST/CLI dispatch failure. The two prior findings are unrelated incidents:
1. REST `e50c491a` dead-conversation = REST dispatch doesn't execute on THIS Nomad deploy (separate infra fact; use CLI).
2. CLI `eab2c875` zombie = idle_timeout on a stalled model stream (transient, resumable).

**Implication**: openspec-apply is RESUMABLE by design — task state lives on disk (tasks.md checkboxes = 26/67; task-queue.json). Re-dispatching via CLI picks up at task 1.7. Stranded `src/lib/openspec-parser/*` (645 lines, missing `index.ts` barrel) is PARTIAL; the TDD RED phase will detect the unresolvable `@/lib/openspec-parser` import and the GREEN phase completes `index.ts`. No data loss.

**Action**: re-dispatch build-mvp via CLI; trust resumability. If a stall recurs, the run is still safe to re-dispatch (idempotent on task checkboxes).
