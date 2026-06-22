/**
 * Task 4.1 — Composable task filters (req 04 §4.9).
 *
 * Filters compose (AND). Active-filter count drives the badge on the filter
 * button. Filters: change, assignee, label, priority, due-date range,
 * completion status, free-text.
 */
import { describe, expect, it } from "vitest";
import { activeFilterCount, applyFilters, type TaskFilter } from "./filters";
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

describe("applyFilters (AND composition)", () => {
  const tasks: RichTask[] = [
    task({ id: "1", changeId: "c1", assignees: ["a"], labels: ["bug"], priority: "high", checked: true }),
    task({ id: "2", changeId: "c2", assignees: ["b"], labels: ["ui"], priority: "low", checked: false }),
    task({ id: "3", changeId: "c1", assignees: ["a", "b"], labels: ["bug", "ui"], priority: "medium", checked: false }),
  ];

  it("returns all when no filters set", () => {
    expect(applyFilters(tasks, {}).map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("filters by change id", () => {
    const r = applyFilters(tasks, { changeIds: ["c2"] });
    expect(r.map((t) => t.id)).toEqual(["2"]);
  });

  it("filters by assignee (any-match)", () => {
    const r = applyFilters(tasks, { assignees: ["b"] });
    expect(r.map((t) => t.id)).toEqual(["2", "3"]);
  });

  it("filters by label (any-match)", () => {
    const r = applyFilters(tasks, { labels: ["ui"] });
    expect(r.map((t) => t.id)).toEqual(["2", "3"]);
  });

  it("filters by priority", () => {
    const r = applyFilters(tasks, { priorities: ["high"] });
    expect(r.map((t) => t.id)).toEqual(["1"]);
  });

  it("filters by completion status", () => {
    const open = applyFilters(tasks, { completion: "open" });
    const done = applyFilters(tasks, { completion: "done" });
    expect(open.map((t) => t.id)).toEqual(["2", "3"]);
    expect(done.map((t) => t.id)).toEqual(["1"]);
  });

  it("composes multiple filters with AND", () => {
    const r = applyFilters(tasks, { changeIds: ["c1"], labels: ["bug"], completion: "open" });
    expect(r.map((t) => t.id)).toEqual(["3"]);
  });
});

describe("due-date range filter", () => {
  const tasks: RichTask[] = [
    task({ id: "1", dueDate: "2026-06-01T00:00:00.000Z" }),
    task({ id: "2", dueDate: "2026-06-15T00:00:00.000Z" }),
    task({ id: "3", dueDate: "2026-07-01T00:00:00.000Z" }),
    task({ id: "4", dueDate: null }),
  ];
  it("inclusive range, nulls excluded unless range absent", () => {
    const r = applyFilters(tasks, { dueFrom: "2026-06-01", dueTo: "2026-06-30" });
    expect(r.map((t) => t.id)).toEqual(["1", "2"]);
  });
});

describe("activeFilterCount", () => {
  it("counts each distinct active filter dimension", () => {
    const f: TaskFilter = {
      changeIds: ["c1"],
      assignees: ["a"],
      labels: [],
      priorities: ["high"],
      completion: "open",
    };
    // changeIds(1) + assignees(1) + priorities(1) + completion(1) = 4
    expect(activeFilterCount(f)).toBe(4);
  });

  it("ignores empty arrays and undefined text", () => {
    expect(activeFilterCount({ labels: [], text: "" })).toBe(0);
  });
});
