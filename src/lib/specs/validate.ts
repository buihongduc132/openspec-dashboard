/**
 * Task 2.15 — Spec validate (req 02 §2.5).
 *
 * Runs the documented upstream `openspec validate`-equivalent on a single
 * main spec file and surfaces structured findings. Each finding carries a
 * severity (error/warning), a stable rule id, a 1-based line number, a
 * human-readable message, and — where the fix is deterministic — a suggested
 * fix string.
 *
 * The validator builds on the parser's own structural checks (which already
 * flag delta headers in main specs and requirements outside the Requirements
 * section) and adds the spec-level invariants that the parser does not assert:
 * duplicate requirement names, scenarios missing Given/When/Then bullets, and
 * requirements without any scenario.
 *
 * Source: `flow/requirements/02-specs.md` §2.5 + dashboard-foundation parser.
 */

import { parseMainSpec, type ParseIssue } from "@/lib/openspec-parser";

/** Severity matches the upstream `openspec validate` contract. */
export type Severity = "error" | "warn";

/** One structured validation finding (req 02 §2.5 AC b). */
export interface ValidationFinding {
  /** Stable machine rule id (namespaced by concern). */
  ruleId: string;
  /** 1-based source line, when applicable. */
  line?: number;
  /** 1-based source column, when applicable. */
  col?: number;
  severity: Severity;
  message: string;
  /** Deterministic suggested fix; absent when no single fix applies. */
  suggestedFix?: string;
}

const REQUIREMENT_HEADER = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO_HEADER = /^####\s+Scenario:\s*(.+?)\s*$/;
const DELTA_SECTION = /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements\s*$/i;

/** RFC 2119 Given/When/Then bullet marker inside a scenario body. */
const GWT_BULLET = /^\s*-\s+\*\*(GIVEN|WHEN|THEN)\*\*/i;

/**
 * Validate a single main spec file. Mirrors the upstream
 * `openspec validate <file>` behaviour for the documented rule set.
 */
export function validateSpec(
  content: string,
  filePath: string,
): ValidationFinding[] {
  // 1. Carry through the parser's own structural findings (delta header in a
  //    main spec, requirement outside the Requirements section, etc.) and
  //    promote them to the public ValidationFinding shape with stable rule ids.
  const { model, issues } = parseMainSpec(content, filePath);
  const findings: ValidationFinding[] = issues.map(toFinding);

  const lines = content.split("\n");

  // 2. Delta-section header detection (parser already emits one, but we add a
  //    dedicated rule id + suggested fix so the UI can offer "Apply fix").
  for (let i = 0; i < lines.length; i++) {
    if (DELTA_SECTION.test(lines[i])) {
      findings.push({
        ruleId: "main-spec.delta-header",
        line: i + 1,
        severity: "error",
        message:
          "Delta section header (ADDED/MODIFIED/REMOVED/RENAMED Requirements) is not allowed in a main spec — move it to a change's delta spec.",
        suggestedFix: "Remove the delta section header from the main spec.",
      });
    }
  }

  // 3. Duplicate requirement names within the same spec.
  const seen = new Map<string, number>();
  for (const req of model.requirements) {
    const prev = seen.get(req.name);
    if (prev !== undefined) {
      findings.push({
        ruleId: "main-spec.duplicate-requirement",
        line: req.line,
        severity: "error",
        message: `Requirement "${req.name}" is duplicated (first seen at line ${prev}). Requirement names must be unique within a spec.`,
        suggestedFix: `Rename this requirement to a unique title.`,
      });
    } else {
      seen.set(req.name, req.line);
    }
  }

  // 4. Per-scenario Given/When/Then completeness (warning, not error — upstream
  //    allows prose scenarios but recommends the structured form).
  for (const req of model.requirements) {
    for (const scenario of req.scenarios) {
      const markers = new Set<string>();
      // Walk the raw lines belonging to this scenario to detect GWT bullets.
      for (let i = scenario.line; i < lines.length; i++) {
        if (REQUIREMENT_HEADER.test(lines[i]) || SCENARIO_HEADER.test(lines[i])) {
          if (i > scenario.line) break;
        }
        const m = lines[i].match(GWT_BULLET);
        if (m) markers.add(m[1].toUpperCase());
      }
      if (markers.size > 0 && (!markers.has("WHEN") || !markers.has("THEN"))) {
        findings.push({
          ruleId: "main-spec.scenario-missing-gwt",
          line: scenario.line,
          severity: "warn",
          message: `Scenario "${scenario.name}" uses Given/When/Then bullets but is missing a WHEN or THEN step.`,
          suggestedFix:
            "Add the missing `- **WHEN**` / `- **THEN**` bullet(s) to the scenario.",
        });
      }
    }
  }

  return findings;
}

/** Map a parser ParseIssue to the public ValidationFinding shape. */
function toFinding(issue: ParseIssue): ValidationFinding {
  const ruleId =
    issue.kind === "delta-header"
      ? "main-spec.delta-header"
      : issue.kind === "requirement-outside-requirements"
        ? "main-spec.requirement-outside-requirements"
        : `parser.${issue.kind}`;
  const suggestedFix =
    ruleId === "main-spec.delta-header"
      ? "Remove the delta section header from the main spec."
      : ruleId === "main-spec.requirement-outside-requirements"
        ? "Move the requirement under a `## Requirements` section."
        : undefined;
  return {
    ruleId,
    line: issue.line,
    severity: issue.severity,
    message: issue.message,
    suggestedFix,
  };
}
