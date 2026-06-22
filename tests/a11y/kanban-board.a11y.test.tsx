import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import KanbanBoard from "@/app/projects/[id]/kanban/_kanban-board";
import { assertNoAxeViolations } from "./axe";

/**
 * Task 3.4 — axe-core per-component a11y test for the Kanban DnD board.
 *
 * NFR-9 / req 04 §4.6: the Kanban board is the WCAG 2.5.7 Dragging Movements
 * surface. axe-core runs per-component against the rendered board using the
 * ruleset in axe-a11y.config.json (WCAG 2.1 AA + 2.2 AA). axe is automated and
 * cannot fully verify 2.5.7 (a pointerless alternative); the manual AT pass +
 * keyboard-interaction scripts live in docs/accessibility/dnd-manual-at.md.
 * This test covers everything axe CAN verify on the board.
 */

// Stubs matching _kanban-board.test.tsx so the board renders in isolation.
vi.mock("@/lib/entity-reference/build", () => ({
  buildEntityReference: () => ({
    type: "task",
    id: "task-1",
    title: "Wire the button",
    path: "/repo/openspec/changes/add-auth/tasks.md",
    readInstruction: "Read tasks.md and implement task 1.",
    metadata: { taskNumber: "1" },
    generatedAt: "2026-06-19T00:00:00.000Z",
  }),
}));
vi.mock("@/lib/clipboard", () => ({
  copyText: vi.fn(async () => ({ ok: true, fallback: false })),
}));

const task = {
  id: "task-1",
  changeId: "change-9",
  projectId: "proj-1",
  groupTitle: null,
  taskNumber: "1",
  title: "Wire the button",
  description: null,
  status: "ready",
  assignee: null,
  priority: "medium",
  labels: null,
  checked: null,
  createdAt: new Date("2026-06-19T00:00:00.000Z"),
};

const changeMap = new Map([["change-9", "add-auth"]]);

describe("KanbanBoard — axe per-component a11y (NFR-9, task 3.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the board with no axe violations (WCAG 2.1 AA + 2.2 AA)", async () => {
    const { container } = render(
      <KanbanBoard
        initialTasks={[task]}
        changeMap={changeMap}
        projectId="proj-1"
        projectName="My Project"
        projectRootPath="/repos/my-project"
      />,
    );
    await assertNoAxeViolations(container, "KanbanBoard");
  });

  it("renders the empty board (no tasks) with no axe violations", async () => {
    const { container } = render(
      <KanbanBoard
        initialTasks={[]}
        changeMap={changeMap}
        projectId="proj-1"
        projectName="My Project"
        projectRootPath="/repos/my-project"
      />,
    );
    await assertNoAxeViolations(container, "KanbanBoard empty");
  });

  // Sanity that the helper actually catches violations — render a deliberately
  // inaccessible fragment and assert the helper throws. This proves the gate
  // is a failing (not warning) level, satisfying the spec scenario "axe
  // violation fails CI".
  it("helper fails on an inaccessible fragment (gate is failing-level)", async () => {
    const broken = document.createElement("div");
    // Missing alt + empty button — axe flags both.
    broken.innerHTML = `<img src="x.png" /><button></button>`;
    document.body.appendChild(broken);
    await expect(
      assertNoAxeViolations(broken, "deliberately broken"),
    ).rejects.toThrow();
    broken.remove();
  });
});
