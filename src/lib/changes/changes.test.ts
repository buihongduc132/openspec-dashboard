/**
 * Task 2.16 — Change module editors (req 03.1–3.10).
 *
 * Pure logic for:
 *   - 3.3 Change creation: kebab-case name validation + uniqueness + scaffold.
 *   - 3.4 Change metadata edit.
 *   - 3.5 Artifact status tracking (done/ready/blocked/invalid).
 *   - 3.6 Change validation (structural integrity).
 *   - 3.7/3.8/3.9/3.10 artifact/delta/task editor helpers.
 *   - 3.10 Task editor: MAX_TASK_DEPTH constant + deterministic numbering.
 */
import { describe, it, expect } from "vitest";
import {
  CHANGE_NAME_PATTERN,
  validateChangeName,
  scaffoldChange,
  type ScaffoldOptions,
  MAX_TASK_DEPTH,
  computeArtifactStatus,
  validateChange,
  type ArtifactInput,
  type ValidationIssue,
  computeTaskDisplayNumber,
} from "@/lib/changes";

describe("Task 2.16 — Change name validation (req 03.3)", () => {
  it("accepts canonical kebab-case names", () => {
    expect(validateChangeName("add-rbac")).toBe(true);
    expect(validateChangeName("build-openspec-dashboard-mvp")).toBe(true);
    expect(validateChangeName("fix-42")).toBe(true);
  });

  it("rejects non-kebab-case names", () => {
    expect(validateChangeName("Add RBAC")).toBe(false);
    expect(validateChangeName("add_rbac")).toBe(false);
    expect(validateChangeName("addRBAC")).toBe(false);
    expect(validateChangeName("")).toBe(false);
    expect(validateChangeName("-leading-dash")).toBe(false);
    expect(validateChangeName("trailing-dash-")).toBe(false);
    expect(validateChangeName("double--dash")).toBe(false);
  });

  it("exposes the canonical regex", () => {
    expect(CHANGE_NAME_PATTERN.test("a-b")).toBe(true);
  });
});

describe("Task 2.16 — Change scaffold (req 03.3 AC (a))", () => {
  it("scaffolds the canonical artifact files that pass openspec validate", () => {
    const opts: ScaffoldOptions = { name: "add-rbac", schema: "spec-driven" };
    const files = scaffoldChange(opts);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toContain("proposal.md");
    expect(paths).toContain("design.md");
    expect(paths).toContain("tasks.md");
  });

  it("includes the change name in the proposal scaffold", () => {
    const files = scaffoldChange({ name: "add-rbac", schema: "spec-driven" });
    const proposal = files.find((f) => f.path === "proposal.md")!;
    expect(proposal.content).toContain("add-rbac");
  });

  it("seeds tasks.md with an empty checklist group", () => {
    const files = scaffoldChange({ name: "add-rbac", schema: "spec-driven" });
    const tasks = files.find((f) => f.path === "tasks.md")!;
    // Canonical OpenSpec tasks.md has at least one checkbox line.
    expect(tasks.content).toMatch(/-\s*\[[ x]\]\s+\S/);
  });
});

describe("Task 2.16 — MAX_TASK_DEPTH constant (req 03.10)", () => {
  it("is 3 (a dashboard constant, not a schema field)", () => {
    expect(MAX_TASK_DEPTH).toBe(3);
  });
});

describe("Task 2.16 — Task display numbering (req 03.10 AC (a))", () => {
  it("computes deterministic numbering from sidecar order + parent chain", () => {
    // Flat list: 1, 2, 3
    expect(computeTaskDisplayNumber([], 0)).toBe("1");
    expect(computeTaskDisplayNumber([], 2)).toBe("3");
  });

  it("nests numbering under a parent chain up to MAX_TASK_DEPTH", () => {
    // parent chain [0] under group index 0 → "1.1" for first child
    expect(computeTaskDisplayNumber([0], 0)).toBe("1.1");
    expect(computeTaskDisplayNumber([0, 1], 0)).toBe("1.2.1");
  });

  it("caps nesting at MAX_TASK_DEPTH and appends a flat suffix beyond", () => {
    // depth beyond MAX_TASK_DEPTH still returns a deterministic label.
    const deep = computeTaskDisplayNumber([0, 1, 2, 3], 0);
    expect(typeof deep).toBe("string");
    expect(deep.length).toBeGreaterThan(0);
  });
});

describe("Task 2.16 — Artifact status tracking (req 03.5)", () => {
  it("marks a present+non-empty+valid artifact as done", () => {
    const status = computeArtifactStatus({
      present: true,
      content: "## Why\nSome body.",
      valid: true,
      depsDone: true,
    });
    expect(status).toBe("done");
  });

  it("marks a present+invalid artifact as invalid", () => {
    const status = computeArtifactStatus({
      present: true,
      content: "## Why",
      valid: false,
      depsDone: true,
    });
    expect(status).toBe("invalid");
  });

  it("marks a present+valid artifact with unfinished deps as blocked", () => {
    const status = computeArtifactStatus({
      present: true,
      content: "x",
      valid: true,
      depsDone: false,
    });
    expect(status).toBe("blocked");
  });

  it("marks an absent artifact whose deps are done as ready", () => {
    const status = computeArtifactStatus({
      present: false,
      content: "",
      valid: false,
      depsDone: true,
    });
    expect(status).toBe("ready");
  });

  it("marks an absent artifact whose deps are unfinished as blocked", () => {
    const status = computeArtifactStatus({
      present: false,
      content: "",
      valid: false,
      depsDone: false,
    });
    expect(status).toBe("blocked");
  });
});

describe("Task 2.16 — Change validation (req 03.6)", () => {
  it("passes a change with all required artifacts present and valid", () => {
    const artifacts: ArtifactInput[] = [
      { type: "proposal", present: true, content: "## Why\nbody", valid: true },
      { type: "design", present: true, content: "## Context\nbody", valid: true },
      { type: "tasks", present: true, content: "- [ ] 1 Do thing", valid: true },
      { type: "specs", present: true, content: "## ADDED Requirements", valid: true },
    ];
    const result = validateChange(artifacts);
    expect(result.errors).toEqual([]);
  });

  it("errors when a required artifact is missing", () => {
    const artifacts: ArtifactInput[] = [
      { type: "proposal", present: true, content: "## Why\nbody", valid: true },
      { type: "tasks", present: true, content: "- [ ] 1 Do thing", valid: true },
    ];
    const result = validateChange(artifacts);
    expect(result.errors.some((e: ValidationIssue) => /design/i.test(e.message))).toBe(true);
  });

  it("errors when a present artifact is invalid", () => {
    const artifacts: ArtifactInput[] = [
      { type: "proposal", present: true, content: "## Why\nbody", valid: true },
      { type: "design", present: true, content: "", valid: false },
      { type: "tasks", present: true, content: "- [ ] 1 Do thing", valid: true },
      { type: "specs", present: true, content: "## ADDED Requirements", valid: true },
    ];
    const result = validateChange(artifacts);
    expect(result.errors.some((e) => /design/i.test(e.message))).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("flags a delta spec with an unknown verb as a warning", () => {
    const artifacts: ArtifactInput[] = [
      { type: "proposal", present: true, content: "## Why\nbody", valid: true },
      { type: "design", present: true, content: "## Context", valid: true },
      { type: "tasks", present: true, content: "- [ ] 1 Do thing", valid: true },
      {
        type: "specs",
        present: true,
        content: "## UPSERT Requirements\n### Requirement: X",
        valid: false,
      },
    ];
    const result = validateChange(artifacts);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
