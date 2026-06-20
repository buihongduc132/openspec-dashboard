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
