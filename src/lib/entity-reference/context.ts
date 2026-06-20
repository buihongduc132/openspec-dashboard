/**
 * Reference-context factory (task 5.1, design decision D2).
 *
 * The repo-root base for absolute-path resolution is the single most reused
 * piece of context across every surface that builds a reference payload
 * (API route, list pages, detail headers, kanban dialog). To avoid drift,
 * the precedence rule lives here — one canonical place:
 *
 *   1. If `REFERENCE_REPO_ROOT` is set and non-blank, it wins (lets ops
 *      normalize absolute paths across host/container boundaries).
 *   2. Otherwise the project's `rootPath` is used directly (already absolute
 *      in the common local-dev case).
 *   3. Otherwise an empty string (kinds with no filesystem location ignore it
 *      and emit a `dashboard://` logical path).
 *
 * Pages and the API endpoint call {@link buildReferenceContext} /
 * {@link resolveRepoRoot} instead of reading `process.env` inline, so the
 * precedence stays identical everywhere.
 */

import type { ReferenceContext } from "@/lib/entity-reference/types";

/** Read `REFERENCE_REPO_ROOT`, trimming whitespace; empty when unset/blank. */
function readEnvRepoRoot(): string {
  const env = process.env.REFERENCE_REPO_ROOT;
  if (env === undefined) return "";
  const trimmed = env.trim();
  return trimmed;
}

/**
 * Resolve the repo-root base for absolute-path resolution (design D2).
 *
 * @param projectRootPath The project's `rootPath` to fall back to when the
 *                        `REFERENCE_REPO_ROOT` env var is unset or blank.
 * @returns The configured env value if set; otherwise the `projectRootPath`;
 *          otherwise an empty string.
 */
export function resolveRepoRoot(projectRootPath?: string): string {
  const env = readEnvRepoRoot();
  if (env.length > 0) return env;
  return projectRootPath ?? "";
}

/** Options for {@link buildReferenceContext}. */
export interface BuildReferenceContextOptions {
  /** Project filesystem anchor (its `rootPath` column). */
  projectRootPath?: string;
  /** Project name (used in `readInstruction` text). */
  projectName?: string;
  /** Change name (used to resolve change/task paths). */
  changeName?: string;
  /** Spec domain name (used to resolve spec-domain/requirement paths). */
  domainName?: string;
}

/**
 * Build a {@link ReferenceContext} with `repoRoot` resolved per design D2
 * (env-first, fall back to `projectRootPath`). All relational lookups are
 * carried through untouched.
 */
export function buildReferenceContext(
  opts: BuildReferenceContextOptions,
): ReferenceContext {
  const ctx: ReferenceContext = {
    repoRoot: resolveRepoRoot(opts.projectRootPath),
  };
  if (opts.projectRootPath !== undefined) ctx.projectRootPath = opts.projectRootPath;
  if (opts.projectName !== undefined) ctx.projectName = opts.projectName;
  if (opts.changeName !== undefined) ctx.changeName = opts.changeName;
  if (opts.domainName !== undefined) ctx.domainName = opts.domainName;
  return ctx;
}
