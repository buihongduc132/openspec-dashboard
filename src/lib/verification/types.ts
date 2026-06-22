/**
 * Task 4.6 — Verification & quality shared types (req 06 §6.1–6.3).
 *
 * The verification module is split into three pure-function sub-modules:
 *  - {@link verifyChangeHeuristic} (heuristic.ts) — completeness / correctness
 *    / coherence findings for a single change (req 06.1).
 *  - {@link validateProject} (validate-project.ts) — project-wide spec
 *    validation aggregator (req 06.2).
 *  - {@link buildValidationDashboard} (dashboard.ts) — aggregated counts /
 *    top files / trend (req 06.3).
 *
 * Per design D5 the heuristic tier is a pure TypeScript AST/keyword engine
 * (no LLM). The LLM-augmented tier (06.1d) is deferred to Phase 3b.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1–6.3 + design D5.
 */

/** The three heuristic dimensions from req 06 §6.1. */
export type VerifierDimension = "completeness" | "correctness" | "coherence";

/** Severity ladder from req 06 §6.1 AC (a). */
export type VerifierSeverity = "CRITICAL" | "WARNING" | "SUGGESTION";

/**
 * One heuristic finding. Advisory by default (req 06 §6.1 AC c); blocking only
 * when `config.yaml` sets `verify.required: true` (enforced by the route layer).
 */
export interface VerifierFinding {
  /** Which dimension produced this finding. */
  dimension: VerifierDimension;
  /** Stable machine rule id, namespaced by dimension. */
  ruleId: string;
  /** Severity per req 06 §6.1 AC (a). */
  severity: VerifierSeverity;
  /** Artifact path inside the change (e.g. `tasks.md`, `specs/x/spec.md`). */
  artifact: string;
  /** 1-based source line, when applicable. */
  line?: number;
  /** Human-readable summary. */
  message: string;
  /**
   * Rationale for the finding so users can dismiss false positives
   * (design D5 risks; recorded in audit log per req 06 §6.1).
   */
  rationale: string;
}

/** Output of {@link verifyChangeHeuristic}. */
export interface HeuristicReport {
  changeName: string;
  findings: VerifierFinding[];
}

/** A time-bucketed trend point (req 06 §6.3 AC a). */
export interface TrendPoint {
  /** Bucket label (e.g. ISO date `YYYY-MM-DD`). */
  bucket: string;
  /** Findings opened in this bucket. */
  opened: number;
  /** Findings resolved in this bucket. */
  resolved: number;
}
