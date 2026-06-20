import { describe, it, expect } from "vitest";
import { buildEntityReference } from "@/lib/entity-reference/build";
import type { ReferenceContext } from "@/lib/entity-reference/types";

const ctx = (overrides: Partial<ReferenceContext> = {}): ReferenceContext => ({
  repoRoot: "/home/me/repo",
  projectName: "demo",
  projectRootPath: "/home/me/repo",
  changeName: "add-thing",
  domainName: "core",
  ...overrides,
});

describe("buildEntityReference (D3 payload shape)", () => {
  it("assembles a task payload with flat identity fields + metadata, omitting nulls", () => {
    const ref = buildEntityReference(
      "task",
      {
        id: "t1",
        taskNumber: "2",
        title: "Implement the builder",
        status: "todo",
        assignee: null,
        priority: "high",
        dueDate: null,
      },
      ctx({ projectName: "demo" }),
    );

    expect(ref.type).toBe("task");
    expect(ref.id).toBe("t1");
    expect(ref.title).toBe("Implement the builder");
    expect(ref.path).toBe(
      "/home/me/repo/openspec/changes/add-thing/tasks.md",
    );
    expect(ref.readInstruction).toContain("task 2");
    expect(ref.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
    );

    // Task-specific scalar metadata present
    expect(ref.metadata).toMatchObject({
      taskNumber: "2",
      status: "todo",
      priority: "high",
      changeName: "add-thing",
      projectName: "demo",
    });
    // Null optional fields are OMITTED, never serialized as null
    expect(ref.metadata).not.toHaveProperty("assignee");
    expect(ref.metadata).not.toHaveProperty("dueDate");
    // No null values anywhere in metadata
    expect(Object.values(ref.metadata)).not.toContain(null);
  });

  it("keeps a present assignee/dueDate in the task metadata", () => {
    const ref = buildEntityReference(
      "task",
      {
        id: "t2",
        taskNumber: "3",
        title: "Ship it",
        status: "in-progress",
        assignee: "alice",
        priority: "medium",
        dueDate: "2026-07-01",
      },
      ctx(),
    );
    expect(ref.metadata).toMatchObject({
      assignee: "alice",
      dueDate: "2026-07-01",
    });
  });

  it("assembles a requirement payload anchored to the parent spec-domain", () => {
    const ref = buildEntityReference(
      "requirement",
      {
        id: "r1",
        title: "Reference payload structure",
        status: "accepted",
        owner: "bob",
      },
      ctx({ domainName: "entity-reference" }),
    );
    expect(ref.type).toBe("requirement");
    expect(ref.path).toBe(
      "/home/me/repo/openspec/specs/entity-reference/spec.md",
    );
    expect(ref.readInstruction).toContain("Reference payload structure");
    expect(ref.metadata).toMatchObject({ status: "accepted", owner: "bob" });
  });

  it("assembles a schema payload with a dashboard:// logical path and DB note", () => {
    const ref = buildEntityReference(
      "schema",
      { id: "s1", name: "default", version: 3 },
      ctx(),
    );
    expect(ref.type).toBe("schema");
    expect(ref.path).toBe("dashboard://schema/s1");
    expect(ref.metadata).toMatchObject({ name: "default", version: 3 });
    expect(ref.readInstruction).toMatch(/dashboard database|DB|not a file/i);
  });

  it("respects an absolute project rootPath when repoRoot is empty", () => {
    const ref = buildEntityReference(
      "change",
      { id: "c1", name: "add-thing", title: "Add the thing", status: "draft" },
      ctx({ repoRoot: "", projectRootPath: "/abs/repo" }),
    );
    expect(ref.path).toBe("/abs/repo/openspec/changes/add-thing");
  });

  it("always provides the full set of flat identity fields", () => {
    const ref = buildEntityReference(
      "project",
      { id: "p1", name: "demo", rootPath: "/home/me/repo" },
      ctx(),
    );
    for (const key of ["type", "id", "title", "path", "readInstruction", "generatedAt"]) {
      expect(ref).toHaveProperty(key);
    }
    expect(typeof ref.generatedAt).toBe("string");
  });

  it("omits metadata keys whose value is null for any kind (no nulls leak)", () => {
    const ref = buildEntityReference(
      "project",
      {
        id: "p1",
        name: "demo",
        rootPath: "/home/me/repo",
        owner: null,
        status: "active",
      },
      ctx(),
    );
    expect(ref.metadata).not.toHaveProperty("owner");
    expect(ref.metadata).toMatchObject({ status: "active" });
    const json = JSON.stringify(ref);
    // No `:null` metadata values appear in the serialized payload
    expect(json.includes('"owner":null')).toBe(false);
  });
});
