/**
 * Task 4.6 — Project-wide spec validation aggregator unit tests (req 06 §6.2).
 *
 * The aggregator runs the per-file spec validator (req 02 §2.5) across every
 * main spec and surfaces an aggregated, filterable finding list grouped by
 * file. Findings reuse the existing {@link ValidationFinding} model.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.2.
 */
import { describe, it, expect } from "vitest";
import { validateProject, filterFindings } from "@/lib/verification/validate-project";

const CLEAN_AUTH = [
  "# Auth Specification",
  "",
  "## Requirements",
  "",
  "### Requirement: Login",
  "The system SHALL login.",
  "",
  "#### Scenario: Login",
  "- **THEN** the user is logged in",
  "",
].join("\n");

const SNEAKY_AUTH = [
  "# Auth",
  "",
  "## Requirements",
  "",
  "### Requirement: Login",
  "The system SHALL login.",
  "",
  "#### Scenario: Login",
  "- **THEN** the user is logged in",
  "",
  "## ADDED Requirements",
  "",
  "### Requirement: Sneaky",
  "body",
].join("\n");

describe("validateProject", () => {
  it("returns no findings for a clean project", () => {
    const findings = validateProject({ "specs/auth/spec.md": CLEAN_AUTH });
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("aggregates findings across multiple spec files with the file path", () => {
    const findings = validateProject({
      "specs/auth/spec.md": SNEAKY_AUTH,
      "specs/rbac/spec.md": SNEAKY_AUTH.replace("Sneaky", "Sneaky2"),
    });

    const authFindings = findings.filter((f) => f.file === "specs/auth/spec.md");
    const rbacFindings = findings.filter((f) => f.file === "specs/rbac/spec.md");
    expect(authFindings.length).toBeGreaterThan(0);
    expect(rbacFindings.length).toBeGreaterThan(0);
  });

  it("is filterable by severity and rule id via the filter helper", () => {
    const findings = validateProject({ "specs/auth/spec.md": SNEAKY_AUTH });

    const onlyErrors = filterFindings(findings, { severity: "error" });
    expect(onlyErrors.length).toBeGreaterThan(0);
    for (const f of onlyErrors) expect(f.severity).toBe("error");

    const onlyDelta = filterFindings(findings, {
      ruleId: "main-spec.delta-header",
    });
    expect(onlyDelta.length).toBeGreaterThan(0);
    for (const f of onlyDelta) expect(f.ruleId).toBe("main-spec.delta-header");
  });

  it("ignores non-spec files (changes, config, etc.)", () => {
    const findings = validateProject({
      "specs/auth/spec.md": CLEAN_AUTH,
      "changes/add-x/proposal.md": "## Why\nbecause",
      "config.yaml": "defaultSchema: spec-driven",
    });
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });
});
