import { describe, it, expect } from "vitest";
import type {
  EntityType,
  EntityReference,
  ReferenceContext,
} from "@/lib/entity-reference/types";

describe("entity-reference types (unit)", () => {
  it("exports an EntityType union covering every supported kind", () => {
    const supported: EntityType[] = [
      "project",
      "change",
      "spec",
      "spec-domain",
      "requirement",
      "task",
      "schema",
      "context-store",
      "workspace",
      "initiative",
    ];
    expect(supported).toHaveLength(10);
    expect(new Set(supported).size).toBe(10);
  });

  it("accepts a well-formed EntityReference object", () => {
    const ref: EntityReference = {
      type: "task",
      id: "task-1",
      title: "Implement thing",
      path: "/repo/openspec/changes/foo/tasks.md",
      readInstruction: "Find task 1 and implement it.",
      metadata: { taskNumber: 1, status: "todo" },
      generatedAt: "2026-06-19T00:00:00.000Z",
    };
    expect(ref.type).toBe("task");
    expect(ref.metadata.taskNumber).toBe(1);
  });

  it("ReferenceContext carries a repoRoot base plus relational lookups", () => {
    const ctx: ReferenceContext = {
      repoRoot: "/home/me/repo",
      projectName: "demo",
      projectRootPath: "/home/me/repo",
      changeName: "add-thing",
      domainName: "core",
    };
    expect(ctx.repoRoot).toBe("/home/me/repo");
    expect(ctx.changeName).toBe("add-thing");
  });
});
