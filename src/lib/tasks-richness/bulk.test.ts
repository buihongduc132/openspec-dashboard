/**
 * Task 4.1 — Bulk operations, atomic per change folder (req 04 §4.23, §4.11d).
 *
 * Bulk move / assign / label / complete / delete. Bulk-ops are atomic
 * within a single change (all-or-nothing); ops spanning multiple changes
 * run as N independent per-change transactions with a per-change result
 * report.
 */
import { describe, expect, it } from "vitest";
import { applyBulkOperation } from "./bulk";
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

describe("applyBulkOperation", () => {
  const tasks: RichTask[] = [
    task({ id: "1", changeId: "c1", labels: [], assignees: [] }),
    task({ id: "2", changeId: "c2", labels: [], assignees: [] }),
    task({ id: "3", changeId: "c1", labels: [], assignees: [] }),
  ];

  it("bulk complete flips checked for all selected tasks", () => {
    const r = applyBulkOperation(tasks, {
      type: "complete",
      taskIds: ["1", "2", "3"],
      value: true,
    });
    expect(r.results).toHaveLength(3);
    expect(r.results.every((x) => x.ok)).toBe(true);
    const byId = Object.fromEntries(r.updated.map((t) => [t.id, t]));
    expect(byId["1"].checked).toBe(true);
    expect(byId["2"].checked).toBe(true);
    expect(byId["3"].checked).toBe(true);
  });

  it("bulk move updates status", () => {
    const r = applyBulkOperation(tasks, {
      type: "move",
      taskIds: ["1", "3"],
      status: "in-progress",
    });
    const byId = Object.fromEntries(r.updated.map((t) => [t.id, t]));
    expect(byId["1"].status).toBe("in-progress");
  });

  it("bulk assign replaces assignees", () => {
    const r = applyBulkOperation(tasks, {
      type: "assign",
      taskIds: ["1"],
      assignees: ["alice"],
    });
    expect(r.updated.find((t) => t.id === "1")?.assignees).toEqual(["alice"]);
  });

  it("bulk label adds labels idempotantly (union)", () => {
    const r = applyBulkOperation(tasks, {
      type: "label",
      taskIds: ["1", "3"],
      labels: ["bug", "ui"],
    });
    const t1 = r.updated.find((t) => t.id === "1");
    expect(t1?.labels.sort()).toEqual(["bug", "ui"]);
    // Idempotent second application does not duplicate.
    const r2 = applyBulkOperation(r.updated, {
      type: "label",
      taskIds: ["1"],
      labels: ["bug"],
    });
    expect(r2.updated.find((t) => t.id === "1")?.labels).toEqual(["bug", "ui"]);
  });

  it("reports per-change atomicity (each change is its own transaction)", () => {
    const r = applyBulkOperation(tasks, {
      type: "complete",
      taskIds: ["1", "2", "3"],
      value: true,
    });
    const changes = r.perChange.map((c) => c.changeId).sort();
    expect(changes).toEqual(["c1", "c2"]);
    const c1 = r.perChange.find((c) => c.changeId === "c1")!;
    expect(c1.ok).toBe(true);
    expect(c1.appliedTaskIds.sort()).toEqual(["1", "3"]);
  });
});
