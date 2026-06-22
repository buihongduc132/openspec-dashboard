/**
 * Task 1.7 — OpenSpec parser port unit tests.
 *
 * Spec source: `openspec/changes/build-openspec-dashboard-mvp/specs/
 * dashboard-foundation/spec.md` (Requirement "OpenSpec parser port") plus the
 * detailed rule spec in
 * `openspec/changes/add-local-content-projection/specs/openspec-parser/spec.md`
 * and `openspec/changes/phase0-foundations/specs/openspec-parser/spec.md`.
 *
 * These tests assert the BEHAVIOUR the parser MUST satisfy for this task:
 *  - parse a valid spec tree into structured models without throwing,
 *  - record upstream constructs outside its documented rules in a gap registry
 *    and continue parsing.
 */
import { describe, it, expect } from "vitest";
import {
  parseMainSpec,
  parseDeltaSpec,
  parseTasks,
  parseConfigYaml,
  parseChange,
  parseProject,
  DOCUMENTED_RULES,
  createGapRegistry,
  type GapRegistry,
} from "@/lib/openspec-parser";

// ── parseMainSpec ───────────────────────────────────────────────────────────

describe("parseMainSpec", () => {
  it("parses a valid main spec into requirements + scenarios", () => {
    const content = [
      "# Foo Specification",
      "",
      "## Purpose",
      "Does foo things.",
      "",
      "## Requirements",
      "",
      "### Requirement: First",
      "The system SHALL do the first thing.",
      "",
      "#### Scenario: Happy path",
      "- **WHEN** something good happens",
      "- **THEN** everyone is happy",
      "",
      "### Requirement: Second",
      "The system SHALL do the second thing.",
      "",
      "#### Scenario: Edge case",
      "- **WHEN** nothing happens",
      "- **THEN** it is a no-op",
    ].join("\n");

    const { model, issues } = parseMainSpec(content, "openspec/specs/foo/spec.md");

    expect(model.capability).toBe("foo");
    expect(model.requirements).toHaveLength(2);
    expect(model.requirements[0].name).toBe("First");
    expect(model.requirements[0].scenarios).toHaveLength(1);
    expect(model.requirements[0].scenarios[0].name).toBe("Happy path");
    expect(model.requirements[1].name).toBe("Second");
    expect(issues).toEqual([]);
  });

  it("warns when a Requirement header appears outside ## Requirements", () => {
    const content = [
      "### Requirement: Foo",
      "body",
      "",
      "## Requirements",
      "",
      "### Requirement: Bar",
      "body",
    ].join("\n");

    const { model, issues } = parseMainSpec(content, "openspec/specs/foo/spec.md");

    expect(model.requirements.map((r) => r.name)).toEqual(["Bar"]);
    expect(issues.some((i) => i.kind === "requirement-outside-requirements")).toBe(true);
  });

  it("ignores requirement-looking lines inside fenced code blocks", () => {
    const content = [
      "## Requirements",
      "",
      "```md",
      "### Requirement: Decoy",
      "```",
      "",
      "### Requirement: Real",
      "body",
    ].join("\n");

    const { model, issues } = parseMainSpec(content, "openspec/specs/foo/spec.md");

    expect(model.requirements.map((r) => r.name)).toEqual(["Real"]);
    expect(issues.some((i) => i.kind === "requirement-outside-requirements")).toBe(false);
  });

  it("flags a delta header appearing in a main spec as an error", () => {
    const content = ["## Requirements", "", "## ADDED Requirements", ""].join("\n");

    const { issues } = parseMainSpec(content, "openspec/specs/foo/spec.md");

    expect(issues.some((i) => i.kind === "delta-header" && i.severity === "error")).toBe(true);
  });
});

// ── parseDeltaSpec ──────────────────────────────────────────────────────────

describe("parseDeltaSpec", () => {
  const fullDelta = [
    "## ADDED Requirements",
    "",
    "### Requirement: New Cap",
    "Body for new.",
    "",
    "## MODIFIED Requirements",
    "",
    "### Requirement: Existing Cap",
    "Body for modified.",
    "",
    "## REMOVED Requirements",
    "",
    "### Requirement: Old Cap",
    "",
    "## RENAMED Requirements",
    "",
    "### Requirement: From Name",
    "to",
    "### Requirement: To Name",
    "",
  ].join("\n");

  it("parses all four delta verbs", () => {
    const { plan } = parseDeltaSpec(fullDelta, "specs/x/spec.md");

    expect(plan.added).toHaveLength(1);
    expect(plan.added[0].name).toBe("New Cap");
    expect(plan.modified).toHaveLength(1);
    expect(plan.modified[0].name).toBe("Existing Cap");
    expect(plan.removed).toEqual(["Old Cap"]);
    expect(plan.renamed).toEqual([{ from: "From Name", to: "To Name" }]);
  });

  it("records sectionPresence flags correctly", () => {
    const partial = [
      "## ADDED Requirements",
      "",
      "### Requirement: Only",
      "body",
    ].join("\n");

    const { plan } = parseDeltaSpec(partial, "specs/x/spec.md");

    expect(plan.sectionPresence).toEqual({
      added: true,
      modified: false,
      removed: false,
      renamed: false,
    });
  });

  it("matches section headers case-insensitively", () => {
    const lower = ["## added requirements", "", "### Requirement: Lower", "body"].join("\n");
    const { plan } = parseDeltaSpec(lower, "specs/x/spec.md");
    expect(plan.sectionPresence.added).toBe(true);
    expect(plan.added[0].name).toBe("Lower");
  });
});

// ── parseTasks ──────────────────────────────────────────────────────────────

describe("parseTasks", () => {
  it("parses checkbox lines preserving marker + nested children", () => {
    const content = [
      "## 1. Group",
      "",
      "- [x] First",
      "- [ ] Second",
      "  - [ ] Sub of second",
      "",
      "Some prose note.",
    ].join("\n");

    const { items } = parseTasks(content, "tasks.md");

    expect(items).toHaveLength(2);
    expect(items[0].checked).toBe(true);
    expect(items[0].marker).toBe("[x]");
    expect(items[0].label).toBe("First");
    expect(items[0].children).toEqual([]);
    expect(items[1].checked).toBe(false);
    expect(items[1].marker).toBe("[ ]");
    expect(items[1].children).toHaveLength(1);
    expect(items[1].children[0].label).toBe("Sub of second");
  });

  it("preserves the verbatim marker bytes including [X]", () => {
    const content = "- [X] Uppercase marker";
    const { items } = parseTasks(content, "tasks.md");
    expect(items[0].marker).toBe("[X]");
    expect(items[0].checked).toBe(true);
  });
});

// ── parseConfigYaml ─────────────────────────────────────────────────────────

describe("parseConfigYaml", () => {
  it("parses defaultSchema + tools list", () => {
    const content = "defaultSchema: spec-driven\ntools:\n  - claude\n  - cursor";
    expect(parseConfigYaml(content)).toEqual({
      defaultSchema: "spec-driven",
      profiles: [],
      tools: ["claude", "cursor"],
    });
  });

  it("returns empty fields for empty input without throwing", () => {
    expect(parseConfigYaml("")).toEqual({
      defaultSchema: null,
      profiles: [],
      tools: [],
    });
  });
});

// ── parseChange + parseProject ──────────────────────────────────────────────

describe("parseChange", () => {
  it("parses proposal/design/tasks + delta specs into a change model", () => {
    const files = {
      "proposal.md": "## Why\nBecause.",
      "design.md": "## Context\nSome context.",
      "tasks.md": "- [ ] Do thing",
      "specs/cap/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: New",
        "body",
      ].join("\n"),
    };

    const change = parseChange("my-change", files);

    expect(change.name).toBe("my-change");
    expect(change.artifacts.proposal).toContain("Because.");
    expect(change.artifacts.design).toContain("Some context.");
    expect(change.tasks.items[0].label).toBe("Do thing");
    expect(change.deltaSpecs["cap"].plan.added[0].name).toBe("New");
  });
});

describe("parseProject", () => {
  it("parses a valid spec tree into specs + changes without throwing", () => {
    const projectFiles = {
      "config.yaml": "defaultSchema: spec-driven\n",
      "specs/foo/spec.md": [
        "## Requirements",
        "",
        "### Requirement: Foo Cap",
        "body",
        "",
        "#### Scenario: Works",
        "- **WHEN** x",
        "- **THEN** y",
      ].join("\n"),
      "changes/release-1/proposal.md": "## Why\nShip it.",
      "changes/release-1/tasks.md": "- [x] Cut release",
      "changes/release-1/specs/foo/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: Added",
        "body",
      ].join("\n"),
    };

    const project = parseProject(projectFiles);

    expect(project.specs).toHaveLength(1);
    expect(project.specs[0].capability).toBe("foo");
    expect(project.specs[0].requirements[0].name).toBe("Foo Cap");
    expect(project.changes).toHaveLength(1);
    expect(project.changes[0].name).toBe("release-1");
    expect(project.changes[0].tasks.items[0].checked).toBe(true);
    // No issues when the tree is well-formed.
    expect(project.issues).toEqual([]);
  });
});

// ── Gap registry + documented rules ─────────────────────────────────────────

describe("documented rules + gap registry", () => {
  it("enumerates the documented upstream rules", () => {
    expect(DOCUMENTED_RULES.length).toBeGreaterThan(0);
    // Each rule carries a stable id and a human description.
    for (const rule of DOCUMENTED_RULES) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.description).toBe("string");
    }
    const ids = DOCUMENTED_RULES.map((r) => r.id);
    // A few rule ids we definitely document.
    expect(ids).toEqual(expect.arrayContaining([
      "main-spec.requirement-block",
      "main-spec.scenario-block",
      "delta.added-section",
      "tasks.checkbox-line",
      "config.default-schema",
    ]));
  });

  it("records an unknown frontmatter key in the gap registry and continues parsing", () => {
    const gap = createGapRegistry();
    // A frontmatter key NOT in the documented rule set.
    const content = [
      "---",
      "schema: spec-driven",
      "weird-new-key: surprise",
      "---",
      "",
      "## Requirements",
      "",
      "### Requirement: Real",
      "body",
    ].join("\n");

    const { model } = parseMainSpec(content, "openspec/specs/foo/spec.md", { gap });
    // Parsing still produced the model.
    expect(model.requirements.map((r) => r.name)).toEqual(["Real"]);
    // And the unknown construct was recorded.
    expect(gap.entries.length).toBeGreaterThan(0);
    const entry = gap.entries.find((e) => e.construct.includes("weird-new-key"));
    expect(entry).toBeDefined();
    expect(entry?.file).toBe("openspec/specs/foo/spec.md");
  });

  it("a fresh registry reports no gaps", () => {
    const gap: GapRegistry = createGapRegistry();
    expect(gap.entries).toEqual([]);
  });
});
