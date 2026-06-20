import path from "node:path";

/**
 * Enrollment-root allow-list (task 3.1).
 *
 * Local enrollment lets the user point the dashboard at an arbitrary local
 * directory. To avoid accidental filesystem traversal the server only
 * operates on paths that fall inside a configured allow-list of roots.
 *
 * Roots come from the `OPENSPEC_DASHBOARD_ENROLL_ROOTS` environment variable
 * (`:`-separated, POSIX `PATH`-style). When unset/blank the allow-list
 * defaults to the dashboard's own repo root plus `~/Documents/Projects`
 * (design decision D-MPCD-3).
 */

export const ENROLL_ROOTS_ENV = "OPENSPEC_DASHBOARD_ENROLL_ROOTS";

const HOME = (): string => process.env.HOME || process.env.USERPROFILE || "";

/** Expand a leading `~` to the user's home directory. */
function expandTilde(p: string): string {
  if (p === "~") return HOME();
  if (p.startsWith("~/")) {
    const home = HOME();
    return home ? path.join(home, p.slice(2)) : p;
  }
  return p;
}

/**
 * Resolve the list of allowed enrollment roots for the current process.
 *
 * - When `OPENSPEC_DASHBOARD_ENROLL_ROOTS` is set, it is split on `:` and the
 *   segments are returned as-is (after tilde expansion); empty segments are
 *   discarded. The env var is authoritative — setting it REPLACES the
 *   defaults, matching operator intent.
 * - When unset or blank, the default list is `[<repo root>, ~/Documents/Projects]`.
 *
 * Roots are NOT normalized to absolute form beyond tilde expansion; an
 * operator who wants absolute resolution should provide absolute paths.
 * `isPathAllowed` resolves candidate paths against `cwd` for comparison.
 */
export function getEnrollRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env[ENROLL_ROOTS_ENV];
  if (raw !== undefined && raw.trim() !== "") {
    return raw
      .split(":")
      .map((seg) => expandTilde(seg))
      .filter((seg) => seg.length > 0);
  }
  // Defaults: repo root + ~/Documents/Projects (D-MPCD-3).
  const defaults = [process.cwd(), path.join(HOME(), "Documents", "Projects")];
  return defaults.filter((seg) => seg.length > 0);
}

/**
 * Normalize a path into an absolute, traversal-resolved form for comparison.
 * Relative paths resolve against `cwd`. `..` segments are collapsed.
 */
function resolveAbs(candidate: string, base: string = process.cwd()): string {
  return path.resolve(base, candidate);
}

/**
 * True iff `candidate` is exactly an allowed root or a descendant of one,
 * after resolving symlinks-of-traversal (`..`) against `cwd`.
 *
 * Comparison is path-segment aware: `/opt/projects2` is NOT considered under
 * `/opt/projects`, even though it is a string prefix.
 */
export function isPathAllowed(
  candidate: string,
  roots: string[] = getEnrollRoots(),
): boolean {
  if (!candidate || candidate.length === 0) return false;
  const target = resolveAbs(candidate);
  for (const root of roots) {
    const rootAbs = resolveAbs(root);
    if (target === rootAbs) return true;
    // Descendant: relative path must not escape (".." prefix) and must not
    // be absolute (which would mean different roots on different drives).
    const rel = path.relative(rootAbs, target);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  }
  return false;
}
