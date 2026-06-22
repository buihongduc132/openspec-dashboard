/**
 * Task 6.5 — Visual schema editor (req 05.5 per D-SchemaEditor).
 *
 * Covers the pure, testable core of the two-pane editor:
 *   - Visual form ↔ YAML two-way binding (05.5).
 *   - Round-trip safety for YAML-only keys / comments / ordering (INV-2).
 *   - Live validation reuse (05.2).
 *   - Whole-file ETag If-Match save payload shaping.
 *
 * Source: `openspec/changes/phase3b-integration/specs/schema-visual-editor/spec.md`.
 */
import { describe, it, expect } from "vitest";
import {
  parseSchemaDocument,
  applyVisualEdit,
  buildVisualForm,
  buildSavePayload,
  type VisualFormArtifact,
  type VisualSchemaEdit,
  type ParseSuccess,
} from "./visual-editor";
import { validateSchema } from "./validate";
import type { Document } from "yaml";

/** Unwrap a ParseSuccess to the underlying Document (tests use ok-inputs). */
function mustParse(source: string): Document.Parsed {
  const r = parseSchemaDocument(source);
  if (!r.ok) throw new Error(`unexpected parse failure: ${r.error}`);
  return r.document;
}

const VALID_YAML = `# leading comment
name: custom-flow
version: "1.0.0"
description: A custom schema
artifacts:
  - id: proposal
    generates: openspec/changes/{{change}}/proposal.md
    apply:
      requires: []
      tracks: openspec/changes/{{change}}/proposal.md
customKey: preserve me verbatim
`;

describe("parseSchemaDocument + buildVisualForm (05.5)", () => {
  it("builds a visual form from valid YAML", () => {
    const doc = mustParse(VALID_YAML);
    const form = buildVisualForm(doc);
    expect(form.name).toBe("custom-flow");
    expect(form.version).toBe("1.0.0");
    expect(form.description).toBe("A custom schema");
    expect(form.artifacts).toHaveLength(1);
    expect(form.artifacts[0]).toMatchObject({
      id: "proposal",
      generates: "openspec/changes/{{change}}/proposal.md",
    });
  });

  it("exposes parse errors when YAML is invalid", () => {
    const result = parseSchemaDocument("name: foo\n  bad: : : indent\n");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });
});

describe("two-way binding (05.5)", () => {
  it("editing the visual form updates the YAML", () => {
    const doc = mustParse(VALID_YAML);
    const edit: VisualSchemaEdit = {
      type: "artifact-apply-requires",
      artifactId: "proposal",
      requires: ["design"],
    };
    const next = applyVisualEdit(doc, edit);
    const text = next.toString();
    expect(text).toContain("requires:");
    expect(text).toContain("- design");
  });

  it("editing the YAML updates the visual form", () => {
    const doc1 = mustParse(VALID_YAML);
    const editedYaml = doc1
      .toString()
      .replace(
        "tracks: openspec/changes/{{change}}/proposal.md",
        "tracks: openspec/changes/{{change}}/design.md",
      );
    const doc2 = mustParse(editedYaml);
    const form = buildVisualForm(doc2);
    expect(form.artifacts[0].apply?.tracks).toBe(
      "openspec/changes/{{change}}/design.md",
    );
  });
});

describe("round-trip safety for YAML-only keys (INV-2)", () => {
  it("visual edit preserves unknown top-level keys verbatim", () => {
    const doc = mustParse(VALID_YAML);
    const edit: VisualSchemaEdit = {
      type: "artifact-apply-requires",
      artifactId: "proposal",
      requires: ["design"],
    };
    const next = applyVisualEdit(doc, edit);
    const text = next.toString();
    expect(text).toContain("customKey: preserve me verbatim");
  });

  it("visual edit preserves comments and key ordering", () => {
    const doc = mustParse(VALID_YAML);
    const edit: VisualSchemaEdit = {
      type: "artifact-apply-requires",
      artifactId: "proposal",
      requires: ["design"],
    };
    const next = applyVisualEdit(doc, edit);
    const text = next.toString();
    expect(text).toContain("# leading comment");
    // name should still precede version (original ordering preserved)
    expect(text.indexOf("name:")).toBeLessThan(text.indexOf("version:"));
  });
});

describe("live validation reuse (05.2)", () => {
  it("visual form revalidates with the same validator", () => {
    const doc = mustParse(VALID_YAML);
    const findings = validateSchema(doc.toString());
    // valid schema → no findings beyond the template-missing warning
    expect(findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("surfaces an error when an artifact id is not kebab-case", () => {
    const bad = VALID_YAML.replace("id: proposal", "id: Proposal_Bad");
    const doc = mustParse(bad);
    const findings = validateSchema(doc.toString());
    expect(findings.some((f) => f.ruleId === "schema.artifact-id-format")).toBe(true);
  });
});

describe("buildSavePayload — whole-file ETag (INV-7)", () => {
  it("includes an If-Match etag covering the whole file", () => {
    const doc = mustParse(VALID_YAML);
    const payload = buildSavePayload({
      document: doc,
      schemaPath: "openspec/schemas/custom-flow/schema.yaml",
      ifMatch: 'W/"abc123"',
    });
    expect(payload.ifMatch).toBe('W/"abc123"');
    expect(payload.schemaPath).toBe("openspec/schemas/custom-flow/schema.yaml");
    expect(payload.body).toBe(doc.toString());
  });

  it("payload body reflects visual edits", () => {
    const doc = mustParse(VALID_YAML);
    const next = applyVisualEdit(doc, {
      type: "artifact-apply-requires",
      artifactId: "proposal",
      requires: ["design"],
    });
    const payload = buildSavePayload({
      document: next,
      schemaPath: "openspec/schemas/custom-flow/schema.yaml",
      ifMatch: 'W/"abc123"',
    });
    expect(payload.body).toContain("- design");
  });
});
