import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import KanbanBoard from "@/app/projects/[id]/kanban/_kanban-board";
import type { EntityReference } from "@/lib/entity-reference/types";
import type { BuildRow } from "@/lib/entity-reference/build";

/**
 * Task 4.1 — Kanban task dialog renders a CopyReferenceButton seeded from the
 * open task. The board must build the task reference using the task row plus
 * relational context (changeName + project rootPath + projectName) and hand it
 * to <CopyReferenceButton>.
 *
 * We spy on `buildEntityReference` (the single canonical builder, design D1) to
 * assert the call args, and assert the rendered control is present inside the
 * dialog.
 */

const stubReference: EntityReference = {
  type: "task",
  id: "task-1",
  title: "Wire the button",
  path: "/repo/openspec/changes/add-auth/tasks.md",
  readInstruction: "Read tasks.md and implement task 1.",
  metadata: { taskNumber: "1" },
  generatedAt: "2026-06-19T00:00:00.000Z",
};

// Spy capturing the (type, row, ctx) args the board passes to the builder.
// Returns a fixed payload so <CopyReferenceButton> renders without invoking
// the real path resolver (unit-isolated).
const buildSpy = vi.fn(
  (
    _type: string,
    _row: BuildRow,
    _ctx: unknown,
  ): EntityReference => stubReference,
);
vi.mock("@/lib/entity-reference/build", () => ({
  buildEntityReference: (
    type: string,
    row: BuildRow,
    ctx: unknown,
  ) => buildSpy(type, row, ctx),
}));

// Stub the clipboard so the client CopyReferenceButton never touches the real
// async Clipboard API during render/click.
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
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

const changeMap = new Map([["change-9", "add-auth"]]);

describe("KanbanBoard TaskDetailModal — Copy reference (task 4.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks pointer-capture APIs that Radix DropdownMenu calls.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.hasPointerCapture = vi.fn(() => false);
    proto.setPointerCapture = vi.fn();
    proto.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the task dialog with a Copy reference control built from the task + changeName + project rootPath", () => {
    render(
      <KanbanBoard
        initialTasks={[task]}
        changeMap={changeMap}
        projectId="proj-1"
        projectName="My Project"
        projectRootPath="/repos/my-project"
      />,
    );

    // Click the kanban card to open the TaskDetailModal.
    fireEvent.click(screen.getByText("Wire the button"));

    // The Copy reference control is rendered inside the dialog.
    expect(
      screen.getByRole("button", { name: /copy reference/i }),
    ).toBeTruthy();

    // The task reference was built from the open task with the relational
    // context the task requires (changeName + project rootPath + projectName).
    expect(buildSpy).toHaveBeenCalledTimes(1);
    const [type, row, ctx] = buildSpy.mock.calls[0];
    expect(type).toBe("task");
    expect(row).toMatchObject({
      id: "task-1",
      taskNumber: "1",
      title: "Wire the button",
      status: "ready",
    });
    expect(ctx as Record<string, unknown>).toMatchObject({
      changeName: "add-auth",
      projectRootPath: "/repos/my-project",
      projectName: "My Project",
    });
  });
});
