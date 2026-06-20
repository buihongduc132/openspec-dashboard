# Verifier REJECT — phase2-extended (Round 1)

REJECTED by blind verifier. Fix ALL items, then resubmit the FULL change (proposal + specs + design + tasks), not a partial.

## REJECT reasons (cross-phase boundary violation)

### 1. [CRITICAL] Claims req 4.20 which is owned by Phase 1.5
Your proposal lists `tasks-kanban-rich` as owning "req 04.7–4.10, 4.12–**4.20**, 4.23, 4.24" and lists "per-change progress + velocity rollup" under Task richness.

But the §7 requirement→phase matrix (`flow/plans/2026-06-18_openspec-dashboard-mvp.md`) explicitly maps:
`| 4.20 | Phase 1.5 (progress) |`

And req 04.4.20 (`flow/requirements/04-tasks-kanban.md` §4.20) states:
> **Shall:** Per-change progress bar (tasks done / total). Per-project overview rollup. **Velocity = tasks completed per unit time.**
> **AC (b):** Velocity chart fed by the audit log (completion events), available once the audit log is in place (**Phase 0**)

So 4.20's progress bar, overview rollup, AND velocity ALL belong to Phase 1.5 (phase1-mvp owns them in its `dashboard-overview` capability).

### 2. [CRITICAL] Re-specs velocity — the exact thing the user mandated stays in Phase 1
"velocity rollup" in your proposal duplicates BOTH req 7.5 (Phase 1.5, the velocity chart) AND req 4.20's velocity clause (Phase 1.5). The user explicitly required velocity to remain a Phase 1 deliverable. Re-specing it here is a phantom + an ownership conflict with phase1-mvp.

## Required fixes
1. **Remove req 4.20 from `tasks-kanban-rich` ownership.** Update the capability's owned-reqs to `04.7–4.10, 4.12–4.19, 4.23, 4.24` (drop 4.20).
2. **Remove "per-change progress + velocity rollup"** from the Task richness bullet AND from the `tasks-kanban-rich` capability description. Phase 2 does NOT add progress/velocity — that is Phase 1's `dashboard-overview`.
3. If any Phase 2 spec contains a progress-bar or velocity requirement, remove it.
4. Re-run `openspec status --change phase2-extended` to confirm 4/4 artifacts still complete after edits.

Resubmit the full change. This is 100%-pass-or-reject.
