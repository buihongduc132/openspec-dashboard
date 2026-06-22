/**
 * Task 2.15 — Spec validate unit tests (req 02 §2.5).
 *
 * Source: `flow/requirements/02-specs.md` §2.5 + the dashboard-foundation
 * parser rule set. The validator runs the documented upstream
 * `openspec validate`-equivalent on a single spec file and surfaces structured
 * findings (severity, rule id, line/col, message, suggested fix).
 */
import { describe, it, expect } from "vitest";
import { validateSpec } from "@/lib/specs/validate";

describe("validateSpec", () => {
  it("returns no findings for a well-formed spec", () => {
    const content = [
      "# Foo Specification",
      "",
      "## Requirements",
      "",
      "### Requirement: First",
      "The system SHALL do the first thing.",
      "",
      "#### Scenario: Happy path",
      "- **WHEN** something good happens",
      "- **THEN** everyone is happy",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("flags a delta section header inside a main spec as an error", () => {
    const content = [
      "## Requirements",
      "",
      "## ADDED Requirements",
      "",
      "### Requirement: Sneaky",
      "body",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    const deltaFinding = findings.find((f) => f.ruleId === "main-spec.delta-header");
    expect(deltaFinding).toBeDefined();
    expect(deltaFinding?.severity).toBe("error");
    expect(deltaFinding?.line).toBe(3);
  });

  it("flags a requirement header outside the Requirements section as a warning", () => {
    const content = [
      "# Foo",
      "",
      "### Requirement: Orphan",
      "body",
      "",
      "## Requirements",
      "",
      "### Requirement: Real",
      "body",
      "",
      "#### Scenario: x",
      "- **WHEN** a",
      "- **THEN** b",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    const orphan = findings.find(
      (f) => f.ruleId === "main-spec.requirement-outside-requirements",
    );
    expect(orphan).toBeDefined();
    expect(orphan?.severity).toBe("warn");
    expect(orphan?.line).toBe(3);
  });

  it("flags duplicate requirement names within the same spec as an error", () => {
    const content = [
      "## Requirements",
      "",
      "### Requirement: Dup",
      "body",
      "",
      "#### Scenario: a",
      "- **WHEN** x",
      "- **THEN** y",
      "",
      "### Requirement: Dup",
      "body",
      "",
      "#### Scenario: b",
      "- **WHEN** x",
      "- **THEN** y",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    const dup = findings.find((f) => f.ruleId === "main-spec.duplicate-requirement");
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe("error");
  });

  it("warns when a scenario is missing a WHEN/THEN bullet", () => {
    const content = [
      "## Requirements",
      "",
      "### Requirement: R",
      "body",
      "",
      "#### Scenario: Incomplete",
      "- **THEN** only then",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    const missing = findings.find(
      (f) => f.ruleId === "main-spec.scenario-missing-gwt",
    );
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("warn");
  });

  it("includes a suggested fix where deterministic", () => {
    const content = [
      "## Requirements",
      "",
      "## ADDED Requirements",
      "",
      "### Requirement: X",
      "body",
    ].join("\n");

    const findings = validateSpec(content, "openspec/specs/foo/spec.md");
    const deltaFinding = findings.find((f) => f.ruleId === "main-spec.delta-header");
    expect(deltaFinding?.suggestedFix).toBeTruthy();
  });
});
