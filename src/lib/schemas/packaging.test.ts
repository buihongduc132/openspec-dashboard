/**
 * Task 4.5 — Schema authoring: export / import (req 05 §5.10).
 *
 *  - 05.10 AC (a): Tarball includes a manifest with schema version + fork
 *    provenance (dashboard-side).
 *  - 05.10 AC (b): Import validates before writing; atomic (all-or-nothing).
 *    Import surfaces a name-collision prompt.
 */
import { describe, it, expect } from "vitest";
import {
  buildSchemaPackage,
  serializeSchemaPackage,
  parseSchemaPackage,
  planSchemaImport,
  type SchemaPackageInput,
} from "@/lib/schemas/packaging";

const validInput = (over: Partial<SchemaPackageInput> = {}): SchemaPackageInput => ({
  definition: "name: custom-flow\nversion: 1.0.0\nartifacts:\n  - id: proposal\n    generates: proposal.md\n",
  templates: { "templates/proposal.md": "# Proposal\n" },
  provenance: {
    forkedFromName: "spec-driven",
    forkedFromVersion: "1.0.0",
    forkedFromLayer: "builtin",
    forkedAt: "2026-06-22T00:00:00Z",
  },
  ...over,
});

describe("buildSchemaPackage / serializeSchemaPackage (05.10 a — manifest)", () => {
  it("produces a package whose manifest carries schema version + provenance", () => {
    const pkg = buildSchemaPackage(validInput());
    expect(pkg.manifest.schemaVersion).toBe("1.0.0");
    expect(pkg.manifest.provenance?.forkedFromName).toBe("spec-driven");
    expect(pkg.manifest.files).toEqual(
      expect.arrayContaining(["schema.yaml", "templates/proposal.md"]),
    );
  });

  it("serialize → parse round-trips losslessly", () => {
    const pkg = buildSchemaPackage(validInput());
    const serialized = serializeSchemaPackage(pkg);
    const back = parseSchemaPackage(serialized);
    expect(back.manifest.schemaVersion).toBe("1.0.0");
    expect(back.files["schema.yaml"]).toBe(pkg.files["schema.yaml"]);
    expect(back.files["templates/proposal.md"]).toBe("# Proposal\n");
  });

  it("manifest has a stable format-version + kind discriminator", () => {
    const pkg = buildSchemaPackage(validInput());
    expect(pkg.manifest.kind).toBe("openspec-schema-package");
    expect(typeof pkg.manifest.formatVersion).toBe("number");
  });
});

describe("parseSchemaPackage — validation", () => {
  it("rejects a payload whose manifest kind is wrong", () => {
    const bad = JSON.stringify({
      manifest: { kind: "not-it", formatVersion: 1, schemaVersion: "1.0.0", files: [] },
      files: {},
    });
    expect(() => parseSchemaPackage(bad)).toThrow(/manifest/);
  });

  it("rejects a payload missing a declared file", () => {
    const bad = JSON.stringify({
      manifest: {
        kind: "openspec-schema-package",
        formatVersion: 1,
        schemaVersion: "1.0.0",
        files: ["schema.yaml", "templates/missing.md"],
      },
      files: { "schema.yaml": "x" },
    });
    expect(() => parseSchemaPackage(bad)).toThrow(/missing/i);
  });
});

describe("planSchemaImport (05.10 b — validate before write, atomic)", () => {
  it("reports name collisions against existing project-local schemas", () => {
    const pkg = buildSchemaPackage(validInput());
    const plan = planSchemaImport(pkg, { existingNames: ["custom-flow"] });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.collisions).toEqual(["custom-flow"]);
      // Atomic: no partial writes when blocked.
      expect(plan.files).toBeUndefined();
    }
  });

  it("rejects an invalid schema definition before writing anything", () => {
    const pkg = buildSchemaPackage(validInput({
      definition: "name: custom-flow\nversion: 1.0.0\n", // no artifacts
    }));
    const plan = planSchemaImport(pkg, { existingNames: [] });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.errors.length).toBeGreaterThan(0);
      expect(plan.files).toBeUndefined();
    }
  });

  it("emits an all-or-nothing write plan when there are no collisions and the schema is valid", () => {
    const pkg = buildSchemaPackage(validInput());
    const plan = planSchemaImport(pkg, { existingNames: ["other"] });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.targetDir).toBe("openspec/schemas/custom-flow");
    const paths = plan.files.map((f) => f.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "openspec/schemas/custom-flow/schema.yaml",
        "openspec/schemas/custom-flow/templates/proposal.md",
      ]),
    );
  });
});
