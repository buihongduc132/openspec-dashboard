/**
 * Task 4.6 — Heuristic verifier unit tests (req 06 §6.1).
 *
 * The verifier is a pure TypeScript keyword/AST engine (design D5) producing
 * advisory findings on three dimensions for a single change:
 *  - Completeness — unchecked tasks, ADDED requirements without scenarios,
 *    ADDED/MODIFIED requirements without any implementing task.
 *  - Correctness  — keyword overlap between task prose and requirement intent;
 *    scenario Given/When/Then verbs echoed in task prose.
 *  - Coherence    — design.md decision keywords reflected in delta specs/tasks;
 *    design decisions without implementing tasks flagged.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1 + design D5.
 */
import { describe, it, expect } from "vitest";
import { parseChange, type ChangeModel } from "@/lib/openspec-parser";
import { verifyChangeHeuristic } from "@/lib/verification/heuristic";
import type { VerifierSeverity } from "@/lib/verification/types";

function change(files: Record<string, string>): ChangeModel {
  return parseChange("add-rbac", files);
}

describe("verifyChangeHeuristic — completeness", () => {
  it("flags an ADDED requirement that has no scenarios as CRITICAL", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: RBAC enforcement",
        "The system SHALL enforce RBAC.",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Implement RBAC enforcement"].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    const finding = report.findings.find(
      (f) =>
        f.dimension === "completeness" &&
        f.ruleId === "completeness.requirement-no-scenarios",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe<VerifierSeverity>("CRITICAL");
    expect(finding?.artifact).toBe("specs/auth/spec.md");
    expect(finding?.line).toBeGreaterThan(0);
  });

  it("flags an ADDED requirement with no implementing task as CRITICAL", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: Audit log retention",
        "The system SHALL retain audit logs.",
        "",
        "#### Scenario: Retain logs",
        "- **WHEN** logs are written",
        "- **THEN** they are retained for 90 days",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Implement something unrelated"].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    const finding = report.findings.find(
      (f) =>
        f.dimension === "completeness" &&
        f.ruleId === "completeness.requirement-no-task",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe<VerifierSeverity>("CRITICAL");
  });

  it("flags unchecked tasks as WARNING", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: RBAC enforcement",
        "The system SHALL enforce RBAC.",
        "",
        "#### Scenario: Enforce",
        "- **THEN** access is enforced",
        "",
      ].join("\n"),
      "tasks.md": [
        "- [ ] 1.1 Implement RBAC enforcement",
        "- [x] 1.2 Document RBAC",
      ].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    const unchecked = report.findings.filter(
      (f) => f.ruleId === "completeness.unchecked-task",
    );
    expect(unchecked).toHaveLength(1);
    expect(unchecked[0]?.severity).toBe<VerifierSeverity>("WARNING");
    expect(unchecked[0]?.artifact).toBe("tasks.md");
  });

  it("is advisory: a complete change produces no CRITICAL findings", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: RBAC enforcement",
        "The system SHALL enforce RBAC.",
        "",
        "#### Scenario: Enforce",
        "- **THEN** access is enforced",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Implement RBAC enforcement"].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    expect(report.findings.filter((f) => f.severity === "CRITICAL")).toEqual([]);
  });
});

describe("verifyChangeHeuristic — correctness", () => {
  it("flags scenario Given/When/Then verbs not echoed in any task as SUGGESTION", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: Token rotation",
        "The system SHALL rotate tokens.",
        "",
        "#### Scenario: Rotate on expiry",
        "- **WHEN** the token expires",
        "- **THEN** a new token is minted automatically",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Audit existing tokens"].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    const finding = report.findings.find(
      (f) => f.dimension === "correctness",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe<VerifierSeverity>("SUGGESTION");
  });
});

describe("verifyChangeHeuristic — coherence", () => {
  it("flags design decisions with no implementing task as SUGGESTION", () => {
    const c = change({
      "design.md": [
        "## Decisions",
        "",
        "### D1: Use argon2id for password hashing",
        "**Decision:** Use argon2id.",
        "",
      ].join("\n"),
      "tasks.md": ["- [x] 1.1 Setup login form"].join("\n"),
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: Login",
        "The system SHALL login.",
        "",
        "#### Scenario: Login",
        "- **THEN** the user is logged in",
        "",
      ].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    const finding = report.findings.find(
      (f) =>
        f.dimension === "coherence" &&
        f.ruleId === "coherence.decision-no-task",
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe<VerifierSeverity>("SUGGESTION");
    expect(finding?.artifact).toBe("design.md");
  });
});

describe("verifyChangeHeuristic — output shape", () => {
  it("produces findings with the required public fields", () => {
    const c = change({
      "specs/auth/spec.md": [
        "## ADDED Requirements",
        "",
        "### Requirement: RBAC enforcement",
        "The system SHALL enforce RBAC.",
        "",
      ].join("\n"),
      "tasks.md": ["- [ ] 1.1 Implement RBAC enforcement"].join("\n"),
    });

    const report = verifyChangeHeuristic(c);
    expect(report.changeName).toBe("add-rbac");
    expect(Array.isArray(report.findings)).toBe(true);
    for (const f of report.findings) {
      expect(["completeness", "correctness", "coherence"]).toContain(f.dimension);
      expect(["CRITICAL", "WARNING", "SUGGESTION"]).toContain(f.severity);
      expect(typeof f.artifact).toBe("string");
      expect(typeof f.ruleId).toBe("string");
      expect(typeof f.message).toBe("string");
      expect(typeof f.rationale).toBe("string");
    }
  });
});
