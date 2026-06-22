/**
 * Task 4.6 — Verification & quality module barrel (req 06 §6.1–6.3).
 *
 * Re-exports the three pure-function sub-modules so callers can import from a
 * single entry point:
 *  - {@link verifyChangeHeuristic} (heuristic.ts) — completeness / correctness
 *    / coherence findings for a single change (req 06.1).
 *  - {@link validateProject} (validate-project.ts) — project-wide spec
 *    validation aggregator (req 06.2).
 *  - {@link buildValidationDashboard} (dashboard.ts) — aggregated counts /
 *    top files / trend (req 06.3).
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.1–6.3.
 */

export { verifyChangeHeuristic, keywords } from "./heuristic";
export type {
  HeuristicReport,
  VerifierFinding,
  VerifierDimension,
  VerifierSeverity,
} from "./types";

export { validateProject, filterFindings } from "./validate-project";
export type { ProjectValidationFinding } from "./validate-project";

export { buildValidationDashboard } from "./dashboard";
export type {
  ValidationDashboardReport,
  SeverityCounts,
  TopFile,
  DashboardFinding,
} from "./dashboard";

export { verifyChangeWithLLMTier } from "./llm";
export type {
  LLMVerifierBackend,
  LLMVerifierConfig,
  LLMRawResult,
  LLMUsage,
  CombinedVerifierReport,
  VerifyWithLLMOptions,
} from "./llm";

export type { TrendPoint } from "./types";
