/**
 * Task 4.1 — Swimlane grouping (req 04 §4.7).
 *
 * Horizontal swimlanes group board rows by: change, spec domain, assignee,
 * label, or priority. Swimlane + column form a 2D grid with per-cell counts.
 * A "No lane" fallback exists for tasks missing the grouping attribute.
 */
import { describe, expect, it } from "vitest";
import { groupIntoSwimlanes } from "./swimlanes";
import type { RichTask } from "./types";

function task(partial: Partial<RichTask> & { id: string }): RichTask {
  return {
    changeId: "change-a",
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
    ...partial,
  } as RichTask;
}

describe("groupIntoSwimlanes", () => {
  it("groups by change id", () => {
    const tasks = [
      task({ id: "1", changeId: "change-a" }),
      task({ id: "2", changeId: "change-b" }),
      task({ id: "3", changeId: "change-a" }),
    ];
    const lanes = groupIntoSwimlanes(tasks, "change");
    expect(lanes.map((l) => l.key)).toEqual(["change-a", "change-b"]);
    expect(lanes[0].tasks.map((t) => t.id)).toEqual(["1", "3"]);
    expect(lanes[1].tasks.map((t) => t.id)).toEqual(["2"]);
  });

  it("groups by assignee with multi-assignee fanning out to each lane", () => {
    const tasks = [
      task({ id: "1", assignees: ["alice"] }),
      task({ id: "2", assignees: ["alice", "bob"] }),
    ];
    const lanes = groupIntoSwimlanes(tasks, "assignee");
    const byKey = Object.fromEntries(lanes.map((l) => [l.key, l.tasks.map((t) => t.id)]));
    expect(byKey["alice"]).toEqual(["1", "2"]);
    expect(byKey["bob"]).toEqual(["2"]);
  });

  it("groups by label with multi-label fanning out", () => {
    const tasks = [task({ id: "1", labels: ["bug", "ui"] })];
    const lanes = groupIntoSwimlanes(tasks, "label");
    expect(lanes.map((l) => l.key).sort()).toEqual(["bug", "ui"]);
  });

  it("groups by priority", () => {
    const tasks = [
      task({ id: "1", priority: "high" }),
      task({ id: "2", priority: "low" }),
    ];
    const lanes = groupIntoSwimlanes(tasks, "priority");
    expect(lanes.map((l) => l.key)).toEqual(["high", "low"]);
  });

  it("routes tasks missing the grouping attribute to the No-lane fallback", () => {
    const tasks = [
      task({ id: "1", assignees: [] }),
      task({ id: "2", assignees: ["alice"] }),
    ];
    const lanes = groupIntoSwimlanes(tasks, "assignee");
    const noLane = lanes.find((l) => l.key === null);
    expect(noLane?.tasks.map((t) => t.id)).toEqual(["1"]);
  });

  it("reports per-cell counts in a 2D grid (swimlane x status)", () => {
    const tasks = [
      task({ id: "1", changeId: "c", status: "backlog" }),
      task({ id: "2", changeId: "c", status: "backlog" }),
      task({ id: "3", changeId: "c", status: "done" }),
    ];
    const grid = groupIntoSwimlanes(tasks, "change");
    expect(grid[0].counts).toEqual({ backlog: 2, done: 1 });
  });
});
