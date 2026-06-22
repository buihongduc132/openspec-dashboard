/**
 * Task 2.21 — Schema validation (req 05.7).
 *
 * Validates a schema definition (YAML) + artifact list against the documented
 * invariants:
 *   - YAML must be syntactically valid
 *   - No circular artifact dependency graph
 *   - All artifact IDs are kebab-case
 *   - `apply.tracks` references a real artifact ID
 *   - Template files exist (when paths are provided)
 *
 * Source: `flow/requirements/05-schemas.md` §5.7.
 */

import { describe, expect, it } from "vitest";
import { validateSchema, type SchemaValidationFinding } from "./validate";

describe("Schema validation (req 05.7)", () => {
  it("returns no findings for a valid schema", () => {
    const definition = `name: spec-driven
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
  - id: design
    generates: design.md
    requires: [proposal]
  - id: tasks
    generates: tasks.md
    requires: [design]
    apply:
      tracks: tasks.md`;

    const findings = validateSchema(definition);
    expect(findings).toEqual([]);
  });

  it("flags invalid YAML syntax", () => {
    const definition = `name: broken
artifacts:
  - id: proposal
    generates: proposal.md
  - this is not valid yaml: [`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].ruleId).toBe("schema.yaml-syntax");
    expect(findings[0].severity).toBe("error");
  });

  it("flags circular artifact dependencies", () => {
    const definition = `name: cyclic
artifacts:
  - id: a
    generates: a.md
    requires: [b]
  - id: b
    generates: b.md
    requires: [a]`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    const circular = findings.find((f) => f.ruleId === "schema.circular-dep");
    expect(circular).toBeDefined();
    expect(circular?.severity).toBe("error");
  });

  it("flags non-kebab-case artifact IDs", () => {
    const definition = `name: test
artifacts:
  - id: MyArtifact
    generates: output.md
    requires: []
  - id: another_artifact
    generates: output2.md
    requires: []`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    const invalidIds = findings.filter((f) => f.ruleId === "schema.artifact-id-format");
    expect(invalidIds.length).toBe(2);
    expect(invalidIds[0].severity).toBe("error");
  });

  it("flags apply.tracks referencing a non-existent artifact", () => {
    const definition = `name: test
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
    apply:
      tracks: non-existent.md`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    const invalid = findings.find((f) => f.ruleId === "schema.tracks-ref-invalid");
    expect(invalid).toBeDefined();
    expect(invalid?.severity).toBe("error");
    expect(invalid?.message).toContain("non-existent.md");
  });

  it("flags apply.requires referencing a non-existent artifact", () => {
    const definition = `name: test
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
    apply:
      requires: [missing-artifact]`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    const invalid = findings.find((f) => f.ruleId === "schema.apply-requires-ref-invalid");
    expect(invalid).toBeDefined();
    expect(invalid?.severity).toBe("error");
  });

  it("flags missing template files when paths are provided", () => {
    const definition = `name: test
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
    template: /nonexistent/path/template.md`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(0);
    const missing = findings.find((f) => f.ruleId === "schema.template-missing");
    expect(missing).toBeDefined();
    expect(missing?.severity).toBe("error");
    expect(missing?.message).toContain("template");
  });

  it("suggests fix for non-kebab-case artifact ID", () => {
    const definition = `name: test
artifacts:
  - id: MyArtifact
    generates: output.md
    requires: []`;

    const findings = validateSchema(definition);
    const invalidId = findings.find((f) => f.ruleId === "schema.artifact-id-format");
    expect(invalidId?.suggestedFix).toBeDefined();
  });

  it("validates multiple issues in a single schema", () => {
    const definition = `name: broken
artifacts:
  - id: BadId
    generates: a.md
    requires: [nonexistent]
  - id: another
    generates: b.md
    requires: [BadId]
    apply:
      tracks: missing.md`;

    const findings = validateSchema(definition);
    expect(findings.length).toBeGreaterThan(3);
  });
});
