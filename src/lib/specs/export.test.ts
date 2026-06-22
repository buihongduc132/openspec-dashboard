/**
 * Task 4.4 — Spec export unit tests (req 02 §2.9).
 *
 * Source: `flow/requirements/02-specs.md` §2.9.
 *
 *  - Export a spec (or all specs in a domain) as Markdown (verbatim), PDF,
 *    or structured JSON (parsed AST).
 *  - AC (a): JSON schema of the export is documented and versioned.
 *  - AC (b): PDF export renders scenarios with Given/When/Then emphasis and a
 *    per-requirement anchor index.
 *  - Non-goals: Word/.docx export; live-linked exports (snapshot only).
 */
import { describe, it, expect } from "vitest";
import {
  exportSpecMarkdown,
  exportSpecJson,
  exportSpecPdf,
  EXPORT_JSON_SCHEMA_VERSION,
  type ExportableSpec,
} from "@/lib/specs/export";

const SPEC: ExportableSpec = {
  domain: "auth",
  capability: "auth",
  filePath: "openspec/specs/auth/spec.md",
  requirements: [
    {
      name: "Login",
      body: "The system SHALL authenticate users with a password.",
      scenarios: [
        {
          name: "Valid login",
          body: "- **GIVEN** a registered user\n- **WHEN** the password is correct\n- **THEN** the user is signed in",
        },
      ],
    },
    {
      name: "Logout",
      body: "The system SHALL end the session.",
      scenarios: [],
    },
  ],
};

describe("exportSpecMarkdown", () => {
  it("round-trips the parsed model back to Markdown (verbatim capability)", () => {
    const md = exportSpecMarkdown(SPEC);
    expect(md).toContain("# auth");
    expect(md).toContain("### Requirement: Login");
    expect(md).toContain("The system SHALL authenticate users with a password.");
    expect(md).toContain("#### Scenario: Valid login");
    expect(md).toContain("- **WHEN** the password is correct");
  });

  it("emits requirements and scenarios in source order", () => {
    const md = exportSpecMarkdown(SPEC);
    const loginIdx = md.indexOf("### Requirement: Login");
    const logoutIdx = md.indexOf("### Requirement: Logout");
    expect(loginIdx).toBeGreaterThan(-1);
    expect(logoutIdx).toBeGreaterThan(loginIdx);
  });

  it("produces empty-but-valid markdown when there are no requirements", () => {
    const md = exportSpecMarkdown({ ...SPEC, requirements: [] });
    expect(md).toContain("# auth");
    expect(md).not.toContain("### Requirement:");
  });
});

describe("exportSpecJson", () => {
  it("emits a structured AST with a documented, versioned schema (AC a)", () => {
    const json = exportSpecJson(SPEC);
    expect(json.schemaVersion).toBe(EXPORT_JSON_SCHEMA_VERSION);
    expect(EXPORT_JSON_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/); // semver
    expect(json.spec.domain).toBe("auth");
    expect(json.spec.requirements).toHaveLength(2);
    expect(json.spec.requirements[0].name).toBe("Login");
  });

  it("is serializable as JSON (no functions/symbols)", () => {
    const json = exportSpecJson(SPEC);
    expect(() => JSON.parse(JSON.stringify(json))).not.toThrow();
  });

  it("preserves the Given/When/Then scenario body verbatim in the AST", () => {
    const json = exportSpecJson(SPEC);
    expect(json.spec.requirements[0].scenarios[0].body).toContain("**GIVEN**");
    expect(json.spec.requirements[0].scenarios[0].body).toContain("**THEN**");
  });
});

describe("exportSpecPdf", () => {
  it("emits Given/When/Then-emphasised render sections (AC b)", () => {
    const pdf = exportSpecPdf(SPEC);
    const scenario = pdf.sections.find((s) => s.kind === "scenario")!;
    expect(scenario).toBeDefined();
    expect(scenario.given).toContain("a registered user");
    expect(scenario.when).toContain("the password is correct");
    expect(scenario.then).toContain("the user is signed in");
  });

  it("includes a per-requirement anchor index (AC b)", () => {
    const pdf = exportSpecPdf(SPEC);
    expect(pdf.anchorIndex).toHaveLength(2);
    const login = pdf.anchorIndex.find((a) => a.requirement === "Login")!;
    expect(login.anchor).toMatch(/^requirement-/);
    expect(login.anchor).toContain("login");
  });

  it("documents each render section kind for the PDF layer", () => {
    const pdf = exportSpecPdf(SPEC);
    const kinds = new Set(pdf.sections.map((s) => s.kind));
    expect(kinds.has("requirement")).toBe(true);
    expect(kinds.has("scenario")).toBe(true);
  });
});
