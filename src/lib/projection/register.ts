/**
 * Task 4.2 (GREEN) — local project registration with path allowlist.
 *
 * Implements the filesystem-projection spec "Local project registration with
 * path allowlist":
 *  - registerLocalProject(path, options) validates and returns a project handle
 *  - The path must resolve under one of the allowlist entries (subtree `/**`
 *    pattern or exact path match)
 *  - Traversal (`../../etc`) is neutralized by path.resolve before matching
 *  - Phase 0: local-only registration — no remote clone, no watcher start
 *
 * The allowlist is the operator's defence-in-depth against accidentally
 * watching sensitive directories (/etc, /proc, etc.). The threat model v1
 * (task 8.1) cites this as the Phase-0 mitigation for registration path
 * traversal.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Error thrown when a candidate path is not within the allowlist. */
export class PathAllowlistError extends Error {
  constructor(candidatePath: string) {
    super(
      `Path "${candidatePath}" is outside the registration allowlist. ` +
        `Provide a path that resolves under one of the configured allow entries.`,
    );
    this.name = "PathAllowlistError";
  }
}

/** A successfully registered local project handle. */
export interface RegisteredLocalProject {
  /** Unique project id (UUIDv4). */
  id: string;
  /** Absolute, resolved root path of the project. */
  rootPath: string;
  /** Phase 0 is local-only. */
  enrollmentSource: "local";
}

/** Options for registerLocalProject. */
export interface RegisterOptions {
  /**
   * List of allowlist entries. Each entry is either:
   *   - an exact absolute path (the candidate must equal it or be a child), or
   *   - a path ending in `/**` (the candidate must be under the base).
   * An empty list rejects every path.
   */
  allow: string[];
}

/**
 * Register a local project by absolute rootPath, validated against the
 * operator-supplied allowlist. Returns a project handle on success; throws
 * {@link PathAllowlistError} on rejection.
 *
 * Never throws anything other than `PathAllowlistError` for allowlist
 * violations. The caller (API layer / projection orchestrator) decides how
 * to map that to an HTTP 4xx.
 */
export function registerLocalProject(
  rawPath: string,
  options: RegisterOptions,
): RegisteredLocalProject {
  if (!rawPath || typeof rawPath !== "string") {
    throw new PathAllowlistError(rawPath);
  }

  // Resolve to absolute, canonical form — neutralizes `../../` traversal.
  const resolved = path.resolve(rawPath);

  if (!isWithinAllowlist(resolved, options.allow)) {
    throw new PathAllowlistError(rawPath);
  }

  return {
    id: randomUUID(),
    rootPath: resolved,
    enrollmentSource: "local",
  };
}

/**
 * Check whether `candidate` (an already-resolved absolute path) falls under
 * any allowlist entry. Subtree entries (`/**`) match any descendant; exact
 * entries match the path itself or any descendant.
 */
export function isWithinAllowlist(
  candidate: string,
  allow: string[],
): boolean {
  const normCandidate = normalize(candidate);

  for (const entry of allow) {
    if (!entry) continue;
    if (entry.endsWith("/**")) {
      // Subtree pattern: the base is everything before `/**`.
      const base = normalize(entry.slice(0, -3));
      if (isDescendant(normCandidate, base)) return true;
    } else {
      // Exact entry: candidate must equal or descend from it.
      const base = normalize(entry);
      if (normCandidate === base || isDescendant(normCandidate, base)) {
        return true;
      }
    }
  }
  return false;
}

/** Normalize a path for comparison: resolve to absolute, drop trailing slash,
 *  platform separator → forward slash. Trailing-slash-free comparison avoids
 *  false negatives when an allow entry is `/home/alice/` and candidate is
 *  `/home/alice`. */
function normalize(p: string): string {
  const resolved = path.resolve(p);
  // Use forward slashes everywhere so cross-platform comparison is stable.
  return resolved.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** True if `candidate` is strictly below `base` in the path hierarchy. */
function isDescendant(candidate: string, base: string): boolean {
  if (!base) return false;
  // Must start with the base prefix AND the character immediately after the
  // base must be a path separator (otherwise `/home/alice-evil` would match
  // allow entry `/home/alice`).
  return (
    candidate.startsWith(base) &&
    (candidate.length === base.length || candidate[base.length] === "/")
  );
}
