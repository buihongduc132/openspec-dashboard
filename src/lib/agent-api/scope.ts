/**
 * Task 6.3 — Agent JSON API: scoped token enforcement (req 08.6b / 09.10).
 *
 * Spec source: req 08 §8.6 (a–c) + req 09 §9.10 in
 * `flow/requirements/08-integration-sync.md` / `09-auth-multitenancy.md`.
 *
 * Contract:
 *   - Default deny: a token with no grants can do nothing.
 *   - `pathAllowlist`: glob patterns (e.g. `openspec/changes/<star>/tasks.md`,
 *     `openspec/.dashboard/<star><star>`). Default deny; every grant explicit.
 *   - **`openspec/.dashboard/proposals/` is NOT in the default allowlist** —
 *     agents must be explicitly granted write via `canProposeDeltaSpec`.
 *   - `config.yaml` is NEVER writable unless explicitly granted via
 *     `explicitlyAllowConfigYaml`.
 *   - `allowedVerbs`: default empty; only granted verbs pass.
 *   - `maxWriteRatePerMin`: writes-per-minute per token; over-rate is
 *     rejected (default 60/min, req 09.10).
 *   - "Propose delta spec" creates a pending-review artifact under
 *     `openspec/.dashboard/proposals/` and returns a preview URL — gated
 *     by the explicit `canProposeDeltaSpec` grant.
 */
import { randomUUID } from "node:crypto";

/** A scoped API token's grant matrix (req 09.10 trust-boundary matrix). */
export interface AgentTokenScope {
  /** Project this token is scoped to. */
  projectId: string;
  /** Glob patterns of writable paths. Default: empty (deny). */
  pathAllowlist: string[];
  /** HTTP verbs allowed for writes. Default: empty (deny). */
  allowedVerbs: string[];
  /** Max writes per minute per token. Default 60 (req 09.10). */
  maxWriteRatePerMin: number;
  /**
   * Whether this token is allowed to propose delta specs. Default false —
   * `openspec/.dashboard/proposals/` is NOT in the default allowlist
   * (req 09.10).
   */
  canProposeDeltaSpec: boolean;
  /**
   * Explicit grant to write `openspec/config.yaml`. Default false — even
   * when a glob would otherwise match, config.yaml requires this explicit
   * grant (req 08.6b).
   */
  explicitlyAllowConfigYaml?: boolean;
}

/**
 * Build the default-allowlist token scope.
 *
 * Every field starts at "deny": empty allowlist, empty verbs, proposals off,
 * config.yaml gated. Rate defaults to 60 writes/min (req 09.10).
 */
export function defaultTokenScope(): AgentTokenScope {
  return {
    projectId: "",
    pathAllowlist: [],
    allowedVerbs: [],
    maxWriteRatePerMin: 60,
    canProposeDeltaSpec: false,
  };
}

/** Outcome of {@link authorizeWrite}. */
export type WriteAuthResult =
  | { allowed: true }
  | { allowed: false; reason: "verb" | "path" | "config_yaml" | "rate" };

const CONFIG_YAML_RE = /(^|\/)config\.yaml$/;

/**
 * Authorise a write against the scoped token.
 *
 * Order of checks (fail-fast, cheapest first):
 *   1. verb — denied unless in `allowedVerbs`.
 *   2. path — denied unless it matches a glob in `pathAllowlist`.
 *   3. config.yaml hard guard — denied unless `explicitlyAllowConfigYaml`.
 *   4. rate — denied if `writesThisMinute >= maxWriteRatePerMin`.
 *
 * `writesThisMinute` is the caller-supplied count of writes already performed
 * in the current rolling minute window (rate-limit state lives outside this
 * module — it's the caller's job to keep that counter).
 */
export function authorizeWrite(
  scope: AgentTokenScope,
  verb: string,
  path: string,
  writesThisMinute: number,
): WriteAuthResult {
  // 1) verb gate
  if (!scope.allowedVerbs.includes(verb)) {
    return { allowed: false, reason: "verb" };
  }
  // 2) path-allowlist gate (default deny)
  const pathAllowed = scope.pathAllowlist.some((glob) => globMatch(glob, path));
  if (!pathAllowed) return { allowed: false, reason: "path" };
  // 3) config.yaml hard guard
  if (CONFIG_YAML_RE.test(path) && !scope.explicitlyAllowConfigYaml) {
    return { allowed: false, reason: "config_yaml" };
  }
  // 4) rate limit
  if (writesThisMinute >= scope.maxWriteRatePerMin) {
    return { allowed: false, reason: "rate" };
  }
  return { allowed: true };
}

/**
 * Minimal glob matcher for the trust-boundary matrix.
 *
 * Supported: `*` matches a single path segment (no slashes), `**` matches
 * any number of segments (including zero). Everything else is literal.
 * The match is case-sensitive on paths.
 */
export function globMatch(pattern: string, path: string): boolean {
  // Translate the glob into a RegExp. `**` becomes `.*`, `*` becomes `[^/]*`.
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      // `**` optionally followed by a slash — matches any number of segments.
      re += "(?:.*/)?";
      i += 2;
      if (pattern[i] === "/") i += 1;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      i += 1;
      continue;
    }
    // Escape RegExp-special characters.
    re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  re += "$";
  return new RegExp(re).test(path);
}

/* ------------------------------------------------------------------ *
 * Propose delta spec (req 08.6c)
 * ------------------------------------------------------------------ */

/** Outcome of {@link proposeDeltaSpec}. */
export type ProposeResult =
  | {
      ok: true;
      artifactPath: string;
      previewUrl: string;
      status: "pending_review";
    }
  | { ok: false; reason: "not_authorized" };

/**
 * Propose a delta spec artifact on behalf of an agent token.
 *
 * The artifact lands under `openspec/.dashboard/proposals/<change>/` as a
 * pending-review file; the human reviewer approves before it merges into the
 * change's canonical delta spec (req 08.6c). Returns the artifact path and a
 * preview URL.
 *
 * Gated by `canProposeDeltaSpec: true` — agents CANNOT propose delta specs
 * unless the token was granted this capability (req 09.10).
 */
export function proposeDeltaSpec(
  scope: AgentTokenScope,
  changeName: string,
  domainName: string,
  content: string,
): ProposeResult {
  if (!scope.canProposeDeltaSpec) {
    return { ok: false, reason: "not_authorized" };
  }
  const id = randomUUID().slice(0, 8);
  const artifactPath =
    `openspec/.dashboard/proposals/${changeName}/${domainName}.${id}.md`;
  const previewUrl = `/projects/${scope.projectId}/changes/${changeName}?preview=${encodeURIComponent(artifactPath)}`;
  void content; // caller persists; this module computes the target path only
  return {
    ok: true,
    artifactPath,
    previewUrl,
    status: "pending_review",
  };
}
