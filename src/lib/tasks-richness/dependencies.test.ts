/**
 * Task 4.1 — Task dependencies (req 04 §4.12).
 *
 * blocks / blocked-by edges resolved by UUID (stable across renumbering).
 * Cycle detection rejects cycles with a clear error. A task with an
 * uncompleted blocker cannot be moved into Done.
 */
import { describe, expect, it } from "vitest";
import { canMoveToDone, detectCycles } from "./dependencies";
import type { RichTask } from "./types";

function task(partial: Partial<RichTask> & { id: string }): RichTask {
  return {
    changeId: "c",
    title: partial.title ?? "t",
    description: null,
    status: "backlog",
    assignees: [],
    labels: [],
    dueDate: null,
    priority: null,
    dependencies: [],
    comments: [],
    subChecklist: [],
    checked: false,
    ...partial,
  } as RichTask;
}

describe("detectCycles", () => {
  it("returns empty for an acyclic graph", () => {
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2" }),
    ];
    expect(detectCycles(tasks)).toEqual([]);
  });

  it("detects a simple two-node cycle", () => {
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2", dependencies: [{ type: "blocked-by", taskId: "1" }] }),
    ];
    const cycles = detectCycles(tasks);
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0])).toEqual(new Set(["1", "2"]));
  });

  it("detects a longer cycle", () => {
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2", dependencies: [{ type: "blocked-by", taskId: "3" }] }),
      task({ id: "3", dependencies: [{ type: "blocked-by", taskId: "1" }] }),
    ];
    const cycles = detectCycles(tasks);
    expect(cycles).toHaveLength(1);
    expect(new Set(cycles[0])).toEqual(new Set(["1", "2", "3"]));
  });

  it("ignores non-cycle blocks edges when tracing", () => {
    // 1 blocked-by 2; 3 blocks 1 — neither forms a cycle.
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2" }),
      task({ id: "3", dependencies: [{ type: "blocks", taskId: "1" }] }),
    ];
    expect(detectCycles(tasks)).toEqual([]);
  });
});

describe("canMoveToDone", () => {
  it("allows when no blockers", () => {
    const tasks = [task({ id: "1" })];
    expect(canMoveToDone("1", tasks)).toBe(true);
  });

  it("denies when an uncompleted blocker exists", () => {
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2", checked: false }),
    ];
    expect(canMoveToDone("1", tasks)).toBe(false);
  });

  it("allows when all blockers are completed", () => {
    const tasks = [
      task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "2" }] }),
      task({ id: "2", checked: true }),
    ];
    expect(canMoveToDone("1", tasks)).toBe(true);
  });

  it("ignores dangling blocker references (treats as resolved)", () => {
    const tasks = [task({ id: "1", dependencies: [{ type: "blocked-by", taskId: "ghost" }] })];
    expect(canMoveToDone("1", tasks)).toBe(true);
  });
});
