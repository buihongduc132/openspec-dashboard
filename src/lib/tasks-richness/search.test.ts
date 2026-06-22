/**
 * Task 4.1 — Task full-text search (req 04 §4.10, INV-8).
 *
 * Search across titles + descriptions + comments + sub-checklist items.
 * Case-insensitive substring; comment/sub-checklist hits resolve to the
 * owning task.
 */
import { describe, expect, it } from "vitest";
import { searchTasks } from "./search";
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
    ...partial,
  } as RichTask;
}

describe("searchTasks", () => {
  it("matches titles case-insensitively", () => {
    const tasks = [task({ id: "1", title: "Deploy to Prod" }), task({ id: "2", title: "write docs" })];
    const r = searchTasks(tasks, "prod");
    expect(r.map((h) => h.taskId)).toEqual(["1"]);
  });

  it("matches descriptions", () => {
    const tasks = [task({ id: "1", description: "Needs refactoring of the parser" })];
    expect(searchTasks(tasks, "parser").map((h) => h.taskId)).toEqual(["1"]);
  });

  it("matches comment bodies and reports the comment field", () => {
    const tasks = [
      task({
        id: "1",
        comments: [
          { id: "cm1", author: "a", content: "blocked by the auth bug", createdAt: "2026-01-01T00:00:00.000Z" },
        ],
      }),
    ];
    const r = searchTasks(tasks, "auth");
    expect(r).toHaveLength(1);
    expect(r[0].fields).toContain("comments");
  });

  it("matches sub-checklist items and reports the subChecklist field", () => {
    const tasks = [
      task({ id: "1", subChecklist: [{ id: "s1", text: "write migration script", done: false }] }),
    ];
    const r = searchTasks(tasks, "migration");
    expect(r[0].fields).toContain("subChecklist");
  });

  it("returns no hits for empty query", () => {
    const tasks = [task({ id: "1", title: "x" })];
    expect(searchTasks(tasks, "")).toEqual([]);
  });
});
