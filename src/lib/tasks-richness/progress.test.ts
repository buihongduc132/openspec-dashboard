/**
 * Task 4.1 — Progress + due-date helpers (req 04 §4.16, 4.17, 4.20).
 *
 * Sub-checklist progress (done/total); per-change and per-project progress
 * rollup (tasks done / total); overdue + due-this-week detection with
 * timezone-aware UTC storage.
 */
import { describe, expect, it } from "vitest";
import {
  isOverdue,
  isDueThisWeek,
  subChecklistProgress,
  rollupProgress,
} from "./progress";
import type { RichTask } from "./types";

function task(partial: Partial<RichTask> & { id: string }): RichTask {
  return {
    changeId: "c1",
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

describe("subChecklistProgress", () => {
  it("returns 0/0 for an empty checklist", () => {
    expect(subChecklistProgress(task({ id: "1" }))).toEqual({ done: 0, total: 0, ratio: 0 });
  });
  it("counts done items and ratio", () => {
    const t = task({
      id: "1",
      subChecklist: [
        { id: "a", text: "x", done: true },
        { id: "b", text: "y", done: false },
        { id: "c", text: "z", done: true },
      ],
    });
    expect(subChecklistProgress(t)).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
  });
});

describe("rollupProgress", () => {
  const tasks: RichTask[] = [
    task({ id: "1", changeId: "c1", checked: true }),
    task({ id: "2", changeId: "c1", checked: false }),
    task({ id: "3", changeId: "c2", checked: true }),
  ];
  it("rolls up per change", () => {
    const r = rollupProgress(tasks, "change");
    expect(r.byKey.get("c1")).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(r.byKey.get("c2")).toEqual({ done: 1, total: 1, ratio: 1 });
  });
  it("rolls up overall", () => {
    const r = rollupProgress(tasks, "change");
    expect(r.overall).toEqual({ done: 2, total: 3, ratio: 2 / 3 });
  });
});

describe("isOverdue / isDueThisWeek", () => {
  // Fixed "now" so tests are deterministic.
  const NOW = new Date("2026-06-22T12:00:00.000Z");

  it("isOverdue: past due & not checked → true", () => {
    const t = task({ id: "1", dueDate: "2026-06-20T00:00:00.000Z", checked: false });
    expect(isOverdue(t, NOW)).toBe(true);
  });
  it("isOverdue: completed task is never overdue", () => {
    const t = task({ id: "1", dueDate: "2026-06-20T00:00:00.000Z", checked: true });
    expect(isOverdue(t, NOW)).toBe(false);
  });
  it("isOverdue: null dueDate → false", () => {
    expect(isOverdue(task({ id: "1" }), NOW)).toBe(false);
  });

  it("isDueThisWeek: due within next 7 days", () => {
    const t = task({ id: "1", dueDate: "2026-06-25T00:00:00.000Z", checked: false });
    expect(isDueThisWeek(t, NOW)).toBe(true);
  });
  it("isDueThisWeek: due in 10 days → false", () => {
    const t = task({ id: "1", dueDate: "2026-07-02T00:00:00.000Z", checked: false });
    expect(isDueThisWeek(t, NOW)).toBe(false);
  });
});
