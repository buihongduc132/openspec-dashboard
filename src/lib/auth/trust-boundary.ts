/**
 * Task 6.1 — Agent & webhook trust-boundary matrix (req 09.10).
 *
 * Pure decision core for the agent + webhook trust boundary. Default deny;
 * every grant explicit. The matrix documents (req 09.10):
 *
 *   - **path allowlist** — glob patterns (e.g.
 *     `openspec/changes/<change>/tasks.md`, `openspec/.dashboard/`.
 *     `openspec/.dashboard/proposals/` is NOT in the default allowlist —
 *     agents must be explicitly granted write to propose delta specs.
 *   - **allowed-verbs** — HTTP verbs (`GET`, `POST`, `PATCH`, `DELETE`).
 *     Default deny.
 *   - **max-write-rate** — writes per minute per token; default 60/min,
 *     configurable.
 *   - **phase scoping** — enforcement middleware ships in Phase 3b when the
 *     agent API + webhooks land (req 09.10 non-goal for Phase 0–3a).
 *
 * The HTTP-layer middleware (wired to the agent route in Phase 3b) consumes
 * {@link decideTrust} with a boundary configured per token from the DB.
 * This module is the decision table the middleware plugs into.
 *
 * Source: req 09 §9.10.
 */

/**
 * Default agent path allowlist (req 09.10).
 *
 * `openspec/.dashboard/proposals/` is **deliberately absent** — agents must be
 * explicitly granted write to propose delta specs.
 */
export const DEFAULT_AGENT_ALLOWLIST: string[] = [
  "openspec/changes/*/tasks.md",
  "openspec/changes/*/artifacts/*",
  "openspec/changes/*/deltas/*",
];

/** Default max-write-rate per token (req 09.10): 60 writes per minute. */
export const DEFAULT_MAX_WRITE_RATE_PER_MIN = 60;

/** A trust-boundary record (req 09.10). */
export interface TrustBoundary {
  /** Path allowlist: glob patterns. Default deny when nothing matches. */
  pathAllowlist: string[];
  /** Allowed HTTP verbs (upper-cased). Default deny when absent. */
  allowedVerbs: string[];
  /** Maximum writes per minute per token (req 09.10). */
  maxWriteRatePerMin: number;
}

/** Inputs to {@link decideTrust}. */
export interface TrustDecisionInput {
  /** HTTP verb being requested. */
  verb: string;
  /** Path being requested (relative to the agent's change scope). */
  path: string;
  /** Writes the token has made in the last minute (already counted). */
  writesInLastMin: number;
  /** Current wall-clock time (ms) — injectable for tests. */
  now: number;
}

/** Outcome of {@link decideTrust}. */
export interface TrustDecision {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** HTTP status to emit when denied (0 when allowed). */
  statusCode: number;
  /** Human-readable reason (empty when allowed). */
  reason: string;
}

/**
 * Decide whether a request is allowed under `boundary` (req 09.10).
 *
 * Decision logic (default deny):
 *  1. Path must match at least one glob in `pathAllowlist`; otherwise 403.
 *  2. Verb must be in `allowedVerbs` (case-insensitive); otherwise 403.
 *  3. If the verb is a write (`POST` / `PATCH` / `PUT` / `DELETE`),
 *     `writesInLastMin` must be < `maxWriteRatePerMin`; otherwise 429.
 *  4. Otherwise allowed.
 */
/**
 * Hard-guard: paths that are ALWAYS denied regardless of the allowlist (req 09.10
 * defense-in-depth). `config.yaml` and other sensitive config files must never
 * be writable through the agent trust boundary even if an operator mistakenly
 * adds a permissive glob.
 */
const DENIED_PATHS = ["config.yaml", "config.yml", ".env"];

function isDeniedPath(path: string): boolean {
  const segments = path.split("/");
  return DENIED_PATHS.some((d) => segments.includes(d));
}

/**
 * Decide whether a request is allowed under `boundary` (req 09.10).
 *
 * Decision logic (default deny):
 *  0. **config.yaml hard guard** — deny any path touching sensitive config
 *     files regardless of the allowlist (defense in depth).
 *  1. Path must match at least one glob in `pathAllowlist`; otherwise 403.
 *  2. Verb must be in `allowedVerbs` (case-insensitive); otherwise 403.
 *  3. If the verb is a write (`POST` / `PATCH` / `PUT` / `DELETE`),
 *     `writesInLastMin` must be < `maxWriteRatePerMin`; otherwise 429.
 *  4. Otherwise allowed.
 */
export function decideTrust(boundary: TrustBoundary, input: TrustDecisionInput): TrustDecision {
  if (isDeniedPath(input.path)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: `trust boundary: path '${input.path}' is denied by the config.yaml hard guard`,
    };
  }
  if (!boundary.pathAllowlist.some((p) => matchGlob(input.path, p))) {
    return {
      allowed: false,
      statusCode: 403,
      reason: `trust boundary: path '${input.path}' is not in the allowlist`,
    };
  }

  const verbUpper = input.verb.toUpperCase();
  if (!boundary.allowedVerbs.map((v) => v.toUpperCase()).includes(verbUpper)) {
    return {
      allowed: false,
      statusCode: 403,
      reason: `trust boundary: verb '${input.verb}' is not allowed`,
    };
  }

  const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(verbUpper);
  if (isWrite && input.writesInLastMin >= boundary.maxWriteRatePerMin) {
    return {
      allowed: false,
      statusCode: 429,
      reason:
        `trust boundary: write rate limit exceeded ` +
        `(${input.writesInLastMin} >= ${boundary.maxWriteRatePerMin} writes/min)`,
    };
  }

  return { allowed: true, statusCode: 0, reason: "" };
}

/**
 * Match a path against a glob pattern.
 *
 * Supports:
 *  - `*` matches any single path segment (no `/`).
 *  - `**` matches zero or more path segments.
 *  - Literal characters match exactly.
 *
 * `..` path components cause the match to fail (defense in depth).
 *
 * NOTE: This is a deliberate duplicate of `globMatch` in
 * `src/lib/agent-api/scope.ts`. Both implement the same glob semantics but
 * live in separate trust-boundary domains that cannot import each other
 * without creating a circular dependency. Keep both implementations in sync
 * when changing matching behavior.
 */
export function matchGlob(path: string, pattern: string): boolean {
  // Normalize `..` out of consideration: reject escape attempts.
  if (path.split("/").includes("..")) return false;
  if (pattern.split("/").includes("..")) return false;

  const pSegs = path.split("/");
  const patSegs = pattern.split("/");

  return matchSegments(pSegs, 0, patSegs, 0);
}

/** Recursive glob matching over segment arrays. */
function matchSegments(
  p: string[],
  pi: number,
  pat: string[],
  qi: number,
): boolean {
  // Both consumed — match.
  if (pi === p.length && qi === pat.length) return true;

  // Pattern consumed but path still has segments — only match if trailing `**`.
  if (qi === pat.length) return false;

  const seg = pat[qi];
  if (seg === "**") {
    // `**` matches zero or more path segments.
    // Try consuming 0 segments (qi+1) then 1..(p.length-pi) more.
    for (let consume = 0; consume <= p.length - pi; consume++) {
      if (matchSegments(p, pi + consume, pat, qi + 1)) return true;
    }
    return false;
  }

  // Path exhausted but pattern still has segments (and none is `**` from here) — no match.
  if (pi === p.length) return false;

  if (seg === "*") {
    // Single-segment wildcard matches anything but does not cross `/`.
    return matchSegments(p, pi + 1, pat, qi + 1);
  }

  // Literal match.
  if (p[pi] === seg) return matchSegments(p, pi + 1, pat, qi + 1);
  return false;
}
