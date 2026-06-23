/**
 * Task 7.3 — shared projection-status field derivation.
 *
 * The `projects` table persists parse issues in a single `projectionError`
 * TEXT column that may hold EITHER:
 *   - a JSON array of {@link ParseIssueRow} objects (the normal case after a
 *     projection run that collected issues), OR
 *   - a bare human-readable skip-reason string (e.g. "rootPath does not
 *     exist"), OR
 *   - null (never projected / clean run).
 *
 * The projection-status spec requires the project list/detail endpoints AND
 * the dedicated status endpoint to expose a uniform `parseErrors` array. This
 * helper centralizes the JSON parse + filter so every surface derives the
 * array identically.
 */

/** A single parse issue as surfaced to the UI / API consumers. */
export interface ParseIssueRow {
  file: string;
  line?: number;
  severity: "warn" | "error";
  message: string;
}

/**
 * Derive the UI `parseErrors` array from the project's `projectionError`
 * blob. Returns `[]` when the column is null, holds a non-JSON string, or
 * holds JSON that is not an array of valid parse-issue objects.
 */
export function deriveParseErrors(projectionError: string | null): ParseIssueRow[] {
  if (!projectionError) return [];
  try {
    const parsed: unknown = JSON.parse(projectionError);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ParseIssueRow =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as ParseIssueRow).file === "string" &&
        ((e as ParseIssueRow).severity === "warn" ||
          (e as ParseIssueRow).severity === "error") &&
        typeof (e as ParseIssueRow).message === "string" &&
        (typeof (e as ParseIssueRow).line === "undefined" ||
          typeof (e as ParseIssueRow).line === "number"),
    );
  } catch {
    /* not JSON → it's a skip-reason string; parseErrors stays empty */
    return [];
  }
}

/**
 * Shape a raw `projects` row into the API projection-status envelope used by
 * the list/detail GET endpoints. Adds the derived `parseErrors` array and
 * serializes `lastProjectedAt` to an ISO 8601 string.
 */
export interface ProjectStatusEnvelope {
  projected: boolean;
  lastProjectedAt: string | null;
  parseErrors: ParseIssueRow[];
}

/**
 * Merge the projection-status envelope fields into a raw project row, ready
 * for `Response.json`. The original row fields are preserved; only the three
 * status fields are added/normalized.
 */
export function withProjectionStatus<T extends Record<string, unknown>>(
  row: T,
): T & ProjectStatusEnvelope {
  const lastProjectedAt = row.lastProjectedAt;
  return {
    ...row,
    projected: Boolean(row.projected),
    lastProjectedAt:
      lastProjectedAt instanceof Date
        ? lastProjectedAt.toISOString()
        : (lastProjectedAt as string | null) ?? null,
    parseErrors: deriveParseErrors(
      (row.projectionError as string | null | undefined) ?? null,
    ),
  };
}
