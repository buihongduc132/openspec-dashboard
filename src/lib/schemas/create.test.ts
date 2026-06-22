/**
 * Task 4.5 — Schema authoring: creation (req 05 §5.3).
 *
 *  - 05.3 AC (a): Validation rejects circular `requires` DAG, missing
 *    template paths, duplicate / non-kebab artifact IDs.
 *  - 05.3 AC (b): Creation scaffolds the schema directory + template files
 *    from a starter template (the plan lists every file path + body to
 *    write, so a route can perform the atomic write).
 */
import { describe, it, expect } from "vitest";
import {
  planSchemaCreation,
  type SchemaCreationInput,
  type SchemaCreationArtifactInput,
} from "@/lib/schemas/create";

const baseArtifact = (over: Partial<SchemaCreationArtifactInput> = {}): SchemaCreationArtifactInput => ({
  id: "proposal",
  generates: "openspec/changes/{{change}}/proposal.md",
  requires: [],
  apply: { requires: [], tracks: "" },
  template: "templates/proposal.md",
  templateBody: "# Proposal\n\n## Why\n",
  ...over,
});

const baseInput = (over: Partial<SchemaCreationInput> = {}): SchemaCreationInput => ({
  name: "custom-flow",
  version: "1.0.0",
  description: "A custom schema",
  projectId: "00000000-0000-0000-0000-000000000001",
  artifacts: [baseArtifact()],
  ...over,
});

describe("planSchemaCreation — validation (05.3 a)", () => {
  it("rejects a circular requires DAG", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [
        baseArtifact({ id: "a", requires: ["b"] }),
        baseArtifact({ id: "b", requires: ["a"] }),
      ],
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.ruleId === "schema.circular-dep")).toBe(true);
    }
  });

  it("rejects duplicate artifact IDs", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [
        baseArtifact({ id: "proposal" }),
        baseArtifact({ id: "proposal", generates: "x.md" }),
      ],
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.ruleId === "schema.artifact-id-duplicate")).toBe(true);
    }
  });

  it("rejects non-kebab-case artifact IDs", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [baseArtifact({ id: "BadID" })],
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.ruleId === "schema.artifact-id-format")).toBe(true);
    }
  });

  it("rejects a requires reference to an unknown artifact", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [baseArtifact({ id: "proposal", requires: ["ghost"] })],
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.ruleId === "schema.requires-ref-invalid")).toBe(true);
    }
  });

  it("flags a missing template body when a template path is declared", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [baseArtifact({ template: "templates/proposal.md", templateBody: "" })],
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.ruleId === "schema.template-missing")).toBe(true);
    }
  });
});

describe("planSchemaCreation — scaffolding (05.3 b)", () => {
  it("produces a schema dir + one template file per artifact + schema.yaml", () => {
    const res = planSchemaCreation(baseInput({
      artifacts: [
        baseArtifact({ id: "proposal", template: "templates/proposal.md", templateBody: "# P" }),
        baseArtifact({ id: "design", generates: "d.md", template: "templates/design.md", templateBody: "# D", requires: ["proposal"] }),
      ],
    }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const paths = res.plan.files.map((f) => f.path).sort();
    expect(paths).toContain("openspec/schemas/custom-flow/schema.yaml");
    expect(paths).toContain("openspec/schemas/custom-flow/templates/proposal.md");
    expect(paths).toContain("openspec/schemas/custom-flow/templates/design.md");
  });

  it("the scaffolded schema.yaml is valid YAML carrying name/version/artifacts", async () => {
    const { parse: parseYaml } = await import("yaml");
    const res = planSchemaCreation(baseInput());
    if (!res.ok) throw new Error("expected ok");
    const yamlFile = res.plan.files.find((f) => f.path.endsWith("schema.yaml"))!;
    const parsed = parseYaml(yamlFile.body) as {
      name: string; version: string; artifacts: Array<{ id: string; generates: string }>;
    };
    expect(parsed.name).toBe("custom-flow");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.artifacts[0].id).toBe("proposal");
  });

  it("records the dashboard-side schema dir + project anchor", () => {
    const res = planSchemaCreation(baseInput());
    if (!res.ok) throw new Error("expected ok");
    expect(res.plan.schemaDir).toBe("openspec/schemas/custom-flow");
    expect(res.plan.projectId).toBe("00000000-0000-0000-0000-000000000001");
  });
});
