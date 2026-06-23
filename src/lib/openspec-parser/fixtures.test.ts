// Task 3.5 (cycle 1) — corpus fixtures copied from upstream OpenSpec.
//
// The fixtures give the parser corpus-regression coverage against the real
// upstream grammar shapes (one main spec, one delta spec, one tasks file).
// This test is the RED/GREEN gate for task 3.5: the fixtures must exist on
// disk and parse without throwing.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMainSpec, parseDeltaSpec, parseTasks } from "@/lib/openspec-parser";

const fixturesDir = path.resolve(__dirname, "__fixtures__");

function read(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

describe("task 3.5 — corpus fixtures exist and parse", () => {
  it("main-spec fixture exists and parses into a non-empty model", () => {
    const content = read("main-spec.md");
    const { model, issues } = parseMainSpec(content, "specs/auth/spec.md");
    expect(model.capability).toBe("auth");
    expect(model.requirements.length).toBeGreaterThan(0);
    // No hard-error issues for a well-formed fixture.
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("delta-spec fixture exists and parses into buckets", () => {
    const content = read("delta-spec.md");
    const { plan } = parseDeltaSpec(content, "changes/add-x/specs/auth/spec.md");
    expect(plan.added.length + plan.modified.length + plan.removed.length + plan.renamed.length).toBeGreaterThan(0);
  });

  it("tasks fixture exists and parses into checkbox items", () => {
    const content = read("tasks.md");
    const { items } = parseTasks(content, "changes/add-x/tasks.md");
    expect(items.length).toBeGreaterThan(0);
  });
});
