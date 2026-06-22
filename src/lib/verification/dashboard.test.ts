/**
 * Task 4.6 — Validation dashboard aggregator unit tests (req 06 §6.3).
 *
 * The dashboard aggregates validation findings across all changes + specs into
 * counts by severity, top offending files, and a trend stub fed by the audit
 * log (available Phase 0). The trend is supplied externally so the aggregator
 * stays a pure function of inputs.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.3.
 */
import { describe, it, expect } from "vitest";
import type { ValidationFinding } from "@/lib/specs/validate";
import { buildValidationDashboard } from "@/lib/verification/dashboard";

function finding(
  partial: Partial<ValidationFinding> & { file: string },
): ValidationFinding {
  return {
    ruleId: "main-spec.delta-header",
    severity: "error",
    message: "x",
    ...partial,
  };
}

describe("buildValidationDashboard", () => {
  it("counts findings by severity", () => {
    const findings: ValidationFinding[] = [
      finding({ file: "a.md", severity: "error" }),
      finding({ file: "a.md", severity: "error" }),
      finding({ file: "b.md", severity: "warn" }),
    ];

    const report = buildValidationDashboard(findings);
    expect(report.counts.error).toBe(2);
    expect(report.counts.warn).toBe(1);
    expect(report.total).toBe(3);
  });

  it("ranks top offending files by finding count descending", () => {
    const findings: ValidationFinding[] = [
      finding({ file: "a.md" }),
      finding({ file: "a.md" }),
      finding({ file: "a.md" }),
      finding({ file: "b.md" }),
      finding({ file: "b.md" }),
      finding({ file: "c.md" }),
    ];

    const report = buildValidationDashboard(findings);
    expect(report.topFiles[0]).toEqual({ file: "a.md", count: 3 });
    expect(report.topFiles[1]).toEqual({ file: "b.md", count: 2 });
    expect(report.topFiles[2]).toEqual({ file: "c.md", count: 1 });
  });

  it("supports a trend sourced from audit-log resolutions", () => {
    const findings: ValidationFinding[] = [finding({ file: "a.md" })];
    const trend = [
      { bucket: "2026-06-01", opened: 3, resolved: 1 },
      { bucket: "2026-06-02", opened: 2, resolved: 2 },
    ];

    const report = buildValidationDashboard(findings, { trend });
    expect(report.trend).toEqual(trend);
  });

  it("returns an empty but well-shaped report for no findings", () => {
    const report = buildValidationDashboard([]);
    expect(report.total).toBe(0);
    expect(report.counts).toEqual({ error: 0, warn: 0 });
    expect(report.topFiles).toEqual([]);
    expect(report.trend).toEqual([]);
  });
});
