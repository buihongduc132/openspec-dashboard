/**
 * Task 4.6 — Project-wide spec validation aggregator (req 06 §6.2).
 *
 * Runs the per-file spec validator (req 02 §2.5) across every main spec file
 * in a project tree and surfaces an aggregated, filterable finding list
 * grouped by file. Findings reuse the existing {@link ValidationFinding} model
 * so the UI can render them with the same severity / rule-id / line columns
 * already used by the single-spec validator.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.2.
 */

import { validateSpec, type ValidationFinding, type Severity } from "@/lib/specs/validate";

const SPEC_FILE = /specs\/([^/]+)\/spec\.md$/;

/**
 * Aggregated finding with the originating file path attached. The single-spec
 * validator already stamps findings onto a file path argument; here we also
 * surface it as a first-class field for easy grouping/filtering.
 */
export interface ProjectValidationFinding extends ValidationFinding {
  /** Spec file path the finding originated from. */
  file: string;
}

/**
 * Run the per-file spec validator across every main spec in `files` and
 * aggregate the results (req 06 §6.2 AC a). `files` is the same
 * `path → content` mapping the parser consumes (`parseProject`), so callers
 * can feed the project tree once and reuse it.
 *
 * Only main specs (`openspec/specs/<domain>/spec.md`) are validated here,
 * matching the upstream `openspec validate` scope. Delta specs inside changes
 * are covered by the heuristic verifier (req 06 §6.1) and conflict detector
 * (req 06 §6.4).
 */
export function validateProject(
  files: Record<string, string>,
): ProjectValidationFinding[] {
  const findings: ProjectValidationFinding[] = [];

  for (const [path, content] of Object.entries(files)) {
    const norm = path.replace(/\\/g, "/");
    if (!SPEC_FILE.test(norm)) continue;
    for (const f of validateSpec(content, norm)) {
      findings.push({ ...f, file: norm });
    }
  }

  // Deterministic ordering: by file then line, so the report is reproducible
  // regardless of input map iteration order.
  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );

  return findings;
}

/**
 * Filter aggregated findings by severity / file / rule id (req 06 §6.2 AC b).
 * Any filter predicate may be omitted to leave that axis unfiltered.
 */
export function filterFindings(
  findings: ProjectValidationFinding[],
  opts: { severity?: Severity; file?: string; ruleId?: string } = {},
): ProjectValidationFinding[] {
  return findings.filter(
    (f) =>
      (opts.severity === undefined || f.severity === opts.severity) &&
      (opts.file === undefined || f.file === opts.file) &&
      (opts.ruleId === undefined || f.ruleId === opts.ruleId),
  );
}
