import { describe, it, expect } from "vitest";
import {
  resolveProjectLocation,
  resolveChangeLocation,
  resolveTaskLocation,
  resolveSpecDomainLocation,
  resolveRequirementLocation,
  resolveSpecLocation,
  resolveSchemaLocation,
  resolveContextStoreLocation,
  resolveWorkspaceLocation,
  resolveInitiativeLocation,
  resolveLocation,
} from "@/lib/entity-reference/paths";
import type { ReferenceContext } from "@/lib/entity-reference/types";

const ctx = (overrides: Partial<ReferenceContext> = {}): ReferenceContext => ({
  repoRoot: "/home/me/repo",
  projectName: "demo",
  projectRootPath: "/home/me/repo",
  changeName: "add-thing",
  domainName: "core",
  ...overrides,
});

describe("entity-reference path resolution (D8 table)", () => {
  it("project resolves to its rootPath", () => {
    const out = resolveProjectLocation(
      { id: "p1", name: "demo", rootPath: "/home/me/repo" },
      ctx(),
    );
    expect(out.path).toBe("/home/me/repo");
    expect(out.readInstruction).toContain("demo");
    expect(out.readInstruction).toContain("/home/me/repo");
  });

  it("change resolves into the openspec/changes/<name> dir", () => {
    const out = resolveChangeLocation({ id: "c1", name: "add-thing" }, ctx());
    expect(out.path).toBe("/home/me/repo/openspec/changes/add-thing");
    expect(out.readInstruction).toContain("proposal.md");
    expect(out.readInstruction).toContain("tasks.md");
  });

  it("task resolves into the change's tasks.md and names the task number", () => {
    const out = resolveTaskLocation(
      { id: "t1", taskNumber: "2", title: "Do the thing" },
      ctx(),
    );
    expect(out.path).toBe(
      "/home/me/repo/openspec/changes/add-thing/tasks.md",
    );
    expect(out.readInstruction).toContain("task 2");
  });

  it("spec-domain resolves into the openspec/specs/<domainName> dir", () => {
    const out = resolveSpecDomainLocation({ id: "d1", name: "core" }, ctx());
    expect(out.path).toBe("/home/me/repo/openspec/specs/core");
  });

  it("requirement resolves to the domain's spec.md and names the title", () => {
    const out = resolveRequirementLocation(
      { id: "r1", title: "Reference payload structure" },
      ctx(),
    );
    expect(out.path).toBe("/home/me/repo/openspec/specs/core/spec.md");
    expect(out.readInstruction).toContain("Reference payload structure");
  });

  it("spec resolves to the domain's spec.md", () => {
    const out = resolveSpecLocation({ id: "s1", name: "entity-reference" }, ctx());
    expect(out.path).toBe("/home/me/repo/openspec/specs/core/spec.md");
  });

  it("schema uses a dashboard:// logical path and explains DB storage", () => {
    const out = resolveSchemaLocation(
      { id: "s1", name: "default" },
      ctx(),
    );
    expect(out.path).toBe("dashboard://schema/s1");
    expect(out.readInstruction).toMatch(/dashboard database|DB|not a file/i);
  });

  it("context-store uses a dashboard:// logical path and mentions its stored path", () => {
    const out = resolveContextStoreLocation(
      { id: "c1", name: "ctx", path: "/var/ctx" },
      ctx(),
    );
    expect(out.path).toBe("dashboard://context-store/c1");
    expect(out.readInstruction).toContain("/var/ctx");
  });

  it("workspace uses a dashboard:// logical path", () => {
    const out = resolveWorkspaceLocation(
      { id: "w1", name: "main" },
      ctx(),
    );
    expect(out.path).toBe("dashboard://workspace/w1");
  });

  it("initiative uses a dashboard:// logical path", () => {
    const out = resolveInitiativeLocation(
      { id: "i1", title: "Q3 push" },
      ctx(),
    );
    expect(out.path).toBe("dashboard://initiative/i1");
  });

  it("absolute rootPath is used directly even without repoRoot", () => {
    const out = resolveChangeLocation(
      { id: "c1", name: "add-thing" },
      ctx({ repoRoot: "", projectRootPath: "/abs/repo" }),
    );
    expect(out.path).toBe("/abs/repo/openspec/changes/add-thing");
  });

  it("repoRoot overrides projectRootPath when set", () => {
    const out = resolveChangeLocation(
      { id: "c1", name: "add-thing" },
      ctx({ repoRoot: "/override", projectRootPath: "/abs/repo" }),
    );
    expect(out.path).toBe("/override/openspec/changes/add-thing");
  });

  it("resolveLocation dispatches by type for every supported kind", () => {
    const cases = [
      ["project", { id: "p1", name: "demo", rootPath: "/home/me/repo" }],
      ["change", { id: "c1", name: "add-thing" }],
      ["task", { id: "t1", taskNumber: "1", title: "x" }],
      ["spec-domain", { id: "d1", name: "core" }],
      ["requirement", { id: "r1", title: "x" }],
      ["spec", { id: "s1", name: "x" }],
      ["schema", { id: "s1", name: "x" }],
      ["context-store", { id: "c1", name: "x", path: "/p" }],
      ["workspace", { id: "w1", name: "x" }],
      ["initiative", { id: "i1", title: "x" }],
    ] as const;
    for (const [type, row] of cases) {
      const out = resolveLocation(type, row, ctx());
      expect(out.path.length).toBeGreaterThan(0);
      expect(out.readInstruction.length).toBeGreaterThan(0);
    }
  });
});
