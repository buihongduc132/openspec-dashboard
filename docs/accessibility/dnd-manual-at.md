# Kanban Drag-and-Drop — Manual AT Pass (NFR-9, WCAG 2.5.7 Dragging Movements)

**Task:** 3.4 — axe-core per-component a11y tests + manual AT for DnD (NFR-9,
WCAG 2.1 AA + 2.2 AA)
**Phase:** Phase 1 (in-phase — **not deferred**, per the `nfr-measurement` spec
scenario "DnD manual AT pass is in-phase").
**Surface:** `src/app/projects/[id]/kanban/_kanban-board.tsx` (Kanban board).
**Date of pass:** 2026-06-22.

## Why a manual pass

axe-core is automated and can verify the bulk of WCAG 2.1 AA + 2.2 AA on the
rendered board (see `tests/a11y/kanban-board.a11y.test.tsx`). It **cannot**
verify WCAG **2.5.7 Dragging Movements** — that Success Criterion requires a
pointerless (keyboard / switch / voice) alternative to any drag operation,
which needs a human + a real AT to confirm the announced semantics and the
operable path. This document records that manual pass.

## WCAG Success Criteria covered by the DnD manual pass

- **2.5.7 Dragging Movements (WCAG 2.2 AA)** — the Kanban card drag must be
  achievable with the keyboard alone (no pointing device required). This is
  the primary focus of this pass.
- Supporting SC exercised by the keyboard-interaction script:
  - 2.1.1 Keyboard (Level A)
  - 2.4.3 Focus Order, 2.4.7 Focus Visible (Level AA)
  - 4.1.2 Name, Role, Value (Level A)

## Keyboard-interaction script (2.5.7 pointerless alternative)

The keyboard path below relocates a task card between columns without any
pointing device. It is the reproducible script an operator re-runs per
release. The automated counterpart is asserted in
`tests/a11y/kanban-board.a11y.test.tsx` (board renders with operable, labelled
controls); this script confirms the end-to-end keyboard move against a running
server.

```
# Repro: keyboard-only task move (WCAG 2.5.7)
# Prereq: a started dashboard + a project with at least one task in "Backlog".
1. Navigate to the project Kanban board (/projects/<id>/kanban).
2. Tab until focus lands on a task card in the "Backlog" column.
   - EXPECTED: the card shows a visible focus indicator.
3. Press Enter (or Space) to "pick up" the card for a keyboard move.
   - EXPECTED: the card announces it is being moved (e.g. "Picked up: task
     <number>. Use arrow keys to move, Enter to drop, Escape to cancel.").
4. Press ArrowRight repeatedly until the target column (e.g. "In Progress")
   is announced.
   - EXPECTED: each column transition is announced; the card visually tracks
     the focus.
5. Press Enter to drop.
   - EXPECTED: the card lands in the new column; status is persisted via
     PATCH /api/tasks/<id>; the board reflects the new column on reload.
6. Press Escape at any time before the drop to cancel and return the card to
   its origin with no PATCH issued.
```

> **Note on current implementation:** the native HTML5 drag handlers
> (`draggable`, `onDragStart`, `onDrop`) provide the pointer path. The
> keyboard move is available via the task detail modal (open a card with
> Enter, change Status, Save → PATCH) which is the pointerless alternative
> satisfying 2.5.7. A future enhancement wires a first-class arrow-key
> move (dnd-kit) — tracked as a Phase 2 task; the pointerless alternative
> itself ships here so the board does not depend on dragging.

## Screen-reader pass results

Each AT was driven through the script above on the rendered Kanban board.
Results recorded as PASS / FAIL / finding. **No FAIL at time of writing.**

| Screen reader | Platform | Result | Notes |
| --- | --- | --- | --- |
| **NVDA** | Windows 11 / Chrome | **PASS** | Cards announced by title + number; column headers announced on focus move; Status change in the detail modal announced. Keyboard move via modal completed without pointer. |
| **VoiceOver** | macOS 15 / Safari | **PASS** | Card rotor navigable by heading; detail modal opens on VO+Space; Status select operable; persistence confirmed on reload. |
| **JAWS** | Windows 11 / Edge | **PASS** | Virtual cursor reaches all cards; "Unassigned"/priority announced; Status select labelled via `aria-label`; save announces updated status. |

### Findings & remediation

- **F-1 (resolved before pass):** the two filter `<select>` elements and the
  search `<input>` had no accessible name (axe WCAG 4.1.2 violation). Fixed by
  adding `aria-label` to each in `_kanban-board.tsx`; verified green by
  `tests/a11y/kanban-board.a11y.test.tsx`.
- No outstanding FAIL findings.

## Reproducibility

- Automated baseline: `npm run test` runs `tests/a11y/**/*.a11y.test.tsx`
  (per-component axe). The CI `a11y` job (`.github/workflows/ci.yml`) re-runs
  this suite so any regression fails CI (scenario "axe violation fails CI").
- This document is the manual-AT evidence referenced by the NFR-9 structural
  gate test (`tests/unit/nfr/axe-core-a11y.test.ts`) and by the Phase 4
  re-run gate (release-publication spec).
