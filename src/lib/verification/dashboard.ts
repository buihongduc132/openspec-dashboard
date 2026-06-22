/**
 * Task 4.6 — Validation dashboard aggregator (req 06 §6.3).
 *
 * Aggregates validation findings across all changes + specs into counts by
 * severity, top offending files, and a trend stub fed by the audit log
 * (available Phase 0). The trend is supplied externally so the aggregator
 * stays a pure function of inputs.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.3.
 */

import type { ValidationFinding } from "@/lib/specs/validate";
import type { TrendPoint } from "@/lib/verification/types";

/**
 * A validation finding that may carry a `file` field (always present for
 * project-aggregated findings; optional for single-file validation output).
 */
export type DashboardFinding = ValidationFinding & { file?: string };

/** Severity counts for the dashboard (req 06 §6.3 AC a). */
export interface SeverityCounts {
  error: number;
  warn: number;
}

/** Top offending file with its finding count (req 06 §6.3 AC a). */
export interface TopFile {
  file: string;
  count: number;
}

/** Aggregated dashboard report (req 06 §6.3). */
export interface ValidationDashboardReport {
  /** Total findings across all files. */
  total: number;
  /** Counts by severity. */
  counts: SeverityCounts;
  /** Top offending files, sorted descending by count (req 06 §6.3 AC a). */
  topFiles: TopFile[];
  /** Trend of findings opened vs resolved over time (req 06 §6.3 AC a). */
  trend: TrendPoint[];
}

/**
 * Build the aggregated validation dashboard report (req 06 §6.3).
 *
 * The dashboard surfaces:
 *  - Counts by severity (req 06 §6.3 AC a).
 *  - Top offending files, sorted descending by finding count (req 06 §6.3 AC a).
 *  - Trend of findings opened vs resolved over time, supplied by the caller
 *    from the audit log (req 06 §6.3 AC a, Phase 0 audit log availability).
 *
 * Drill-down from dashboard tile to the finding list scoped to that severity
 * or file is supported by filtering the original findings list (req 06 §6.3
 * AC b) — callers can use the `severity` or `file` fields on each finding to
 * filter the aggregated findings before displaying the list.
 *
 * Source: `flow/requirements/06-verification-quality.md` §6.3.
 */
export function buildValidationDashboard(
  findings: DashboardFinding[],
  opts: { trend?: TrendPoint[] } = {},
): ValidationDashboardReport {
  const counts: SeverityCounts = { error: 0, warn: 0 };
  const fileCounts = new Map<string, number>();

  for (const f of findings) {
    if (f.severity === "error") counts.error++;
    else if (f.severity === "warn") counts.warn++;

    const file = f.file ?? "<unknown>";
    fileCounts.set(file, (fileCounts.get(file) ?? 0) + 1);
  }

  const topFiles: TopFile[] = Array.from(fileCounts.entries())
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total: findings.length,
    counts,
    topFiles,
    trend: opts.trend ?? [],
  };
}
