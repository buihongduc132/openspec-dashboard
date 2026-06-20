import { describe, it, expect } from "vitest";
import {
  renderReferenceMarkdown,
  renderReferenceJson,
} from "@/lib/entity-reference/render";
import type { EntityReference } from "@/lib/entity-reference/types";

const ref: EntityReference = {
  type: "task",
  id: "t1",
  title: "Implement the builder",
  path: "/home/me/repo/openspec/changes/add-thing/tasks.md",
  readInstruction: "Find task 2 and implement it.",
  metadata: {
    taskNumber: "2",
    status: "todo",
    priority: "high",
    changeName: "add-thing",
    projectName: "demo",
  },
  generatedAt: "2026-06-19T22:21:05.000Z",
};

describe("renderReferenceJson (D4)", () => {
  it("produces a single valid JSON object that parses back to the source ref", () => {
    const json = renderReferenceJson(ref);
    // No trailing prose — must be a single JSON value
    expect(json.trim().startsWith("{")).toBe(true);
    expect(json.trim().endsWith("}")).toBe(true);

    const parsed = JSON.parse(json);
    expect(parsed).toEqual(ref);
  });
});

describe("renderReferenceMarkdown (D4)", () => {
  it("contains type, title, path, and readInstruction", () => {
    const md = renderReferenceMarkdown(ref);
    expect(md).toContain("task");
    expect(md).toContain("Implement the builder");
    expect(md).toContain("/home/me/repo/openspec/changes/add-thing/tasks.md");
    expect(md).toContain("Find task 2 and implement it.");
  });

  it("is a fenced markdown block with the type as a heading and metadata list", () => {
    const md = renderReferenceMarkdown(ref);
    // Fenced markdown block
    expect(md).toMatch(/^```markdown\n/);
    expect(md).toMatch(/\n```$/);
    // Entity type used as a heading
    expect(md).toMatch(/^```markdown\n# task/m);
    // Metadata list entries
    expect(md).toContain("status");
    expect(md).toContain("todo");
  });
});
