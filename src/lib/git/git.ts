/**
 * Task 6.2 — Per-project Git integration: clone, sync, branch ops.
 *
 * Spec source: req 08 §8.4 ("Git integration") in
 * `flow/requirements/08-integration-sync.md` and the "Sandboxed clone
 * (M-7 hardened)" requirement in
 * `openspec/changes/build-openspec-dashboard-mvp/specs/project-workspace/spec.md`.
 *
 * This module is a thin, *typed* wrapper around the `git` CLI. All process
 * spawning is injectable (matching the existing pattern in
 * `src/lib/openspec-init.ts` and `src/lib/cli-auth.ts`, design decision
 * D-MPCD-5) so the behaviour is fully unit-testable without a real `git`
 * binary. The module deliberately contains NO I/O of its own beyond spawning
 * `git` — it never reads or writes repository files directly.
 *
 * Behaviour contract (req 08.4):
 *  (a) Commit messages are structured `chore(openspec): <verb> <entity>` and
 *      machine-parseable via {@link parseCommitMessage}.
 *  (b) Branch-per-change uses `<prefix>/<change-name>` (default prefix
 *      `openspec`). Push is ALWAYS explicit and user-initiated via
 *      {@link pushBranch}; nothing else pushes.
 *  (c) `git pull` conflicts surface a typed {@link SyncResult} with
 *      `status: "conflict"` rather than throwing, so the UI can offer the
 *      3-way merge flow (INV-7).
 *  (d) Sandboxed clone disables hooks (`core.hooksPath=/dev/null`), recurses
 *      into submodules with `--filter=blob:none`, and skips the automatic
 *      checkout of untrusted branches (`--no-checkout`).
 *
 * "Auto-PR on archive" REQUIRES `autoPush: true` — there is no "auto-PR
 * without push" mode (req 08.4b). {@link validateGitIntegrationConfig}
 * enforces this invariant.
 */
import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { dirname } from "node:path";

/* ------------------------------------------------------------------ *
 * Commit messages (req 08.4a)
 * ------------------------------------------------------------------ */

/** Canonical commit-message prefix for all dashboard-authored commits. */
export const COMMIT_PREFIX = "chore(openspec):";

/** Parsed commit message: verb + entity. */
export interface ParsedCommitMessage {
  verb: string;
  entity: string;
}

/**
 * Build a structured commit message: `chore(openspec): <verb> <entity>`.
 *
 * The verb MUST be a single token (no internal whitespace); the entity is
 * free-form prose (typically `<kind> <name>`). Whitespace around the inputs
 * is trimmed and runs of internal whitespace in `entity` are collapsed to a
 * single space so the message is a stable, machine-parseable single line.
 */
export function buildCommitMessage(verb: string, entity: string): string {
  const v = verb.trim().split(/\s+/)[0];
  const e = entity
    .trim()
    .split(/\s+/)
    .join(" ");
  return `${COMMIT_PREFIX} ${v} ${e}`;
}

/**
 * Parse a dashboard-authored commit message back into `(verb, entity)`.
 *
 * Returns `null` for messages that do not match the canonical
 * `chore(openspec): <verb> <entity>` shape (e.g. hand-written commits,
 * `feat:` / `wip` messages). This is the machine-parseability guarantee of
 * req 08.4a.
 */
export function parseCommitMessage(
  message: string,
): ParsedCommitMessage | null {
  const line = message.split("\n", 1)[0].trim();
  const re = new RegExp(`^${escapeRegex(COMMIT_PREFIX)} (\\S+) (.+)$`);
  const m = re.exec(line);
  if (!m) return null;
  return { verb: m[1], entity: m[2].trim() };
}

/* ------------------------------------------------------------------ *
 * Branch naming (req 08.4b)
 * ------------------------------------------------------------------ */

/** Parsed branch name: prefix + change name. */
export interface ParsedBranchName {
  prefix: string;
  changeName: string;
}

/**
 * Build a branch-per-change name: `<prefix>/<change-name>`.
 *
 * The change name is sanitised: leading/trailing slashes and any internal
 * runs of slashes are collapsed, and whitespace runs become single hyphens,
 * so the result is a valid git refname component.
 */
export function buildBranchName(prefix: string, changeName: string): string {
  const p = prefix.trim().replace(/\/+$/g, "");
  const c = changeName
    .trim()
    .split(/\s+/)
    .join("-")
    .replace(/[\/]+/g, "-")
    .replace(/[~^:?*[\\@{}]/g, "")
    .replace(/^[-/]+|[-/]+$/g, "");
  return `${p}/${c}`;
}

/**
 * Parse a `<prefix>/<change-name>` branch back into its parts.
 *
 * Returns `null` when the branch has no `/` separator (e.g. `main`,
 * `develop`) — such branches are not dashboard-authored change branches.
 */
export function parseBranchName(branch: string): ParsedBranchName | null {
  const idx = branch.indexOf("/");
  if (idx <= 0 || idx >= branch.length - 1) return null;
  return { prefix: branch.slice(0, idx), changeName: branch.slice(idx + 1) };
}

/* ------------------------------------------------------------------ *
 * Integration config (req 08.4b: push always explicit, autoPush off)
 * ------------------------------------------------------------------ */

/**
 * Per-project Git integration configuration.
 *
 * All flags default to OFF — Git integration is opt-in per project, and even
 * when enabled, push is always explicit and user-initiated.
 */
export interface GitIntegrationConfig {
  /** Commit on every save (opt-in). Default `false`. */
  commitOnSave: boolean;
  /** Create one branch per change (opt-in). Default `false`. */
  branchPerChange: boolean;
  /**
   * Whether archive may push the change branch automatically. Default
   * `false` — push is ALWAYS explicit and user-initiated (req 08.4b).
   */
  autoPush: boolean;
  /**
   * Open a PR on the configured forge when a change archives. Requires
   * {@link autoPush} `true` (req 08.4b: no auto-PR without push).
   */
  autoPrOnArchive: boolean;
  /** Target branch for auto-PR (e.g. `main`). Used only when autoPrOnArchive. */
  prTargetBranch: string;
  /** Branch-name prefix for branch-per-change. Default `openspec`. */
  branchPrefix: string;
}

/** The default, all-off integration config (opt-in per project). */
export function defaultGitIntegrationConfig(): GitIntegrationConfig {
  return {
    commitOnSave: false,
    branchPerChange: false,
    autoPush: false,
    autoPrOnArchive: false,
    prTargetBranch: "main",
    branchPrefix: "openspec",
  };
}

/**
 * Validate a Git integration config.
 *
 * Returns a list of human-readable error strings (empty when valid). The key
 * invariant enforced here (req 08.4b) is that `autoPrOnArchive` cannot be
 * enabled without `autoPush` — forges cannot open a PR for a branch that was
 * never pushed.
 */
export function validateGitIntegrationConfig(
  config: GitIntegrationConfig,
): string[] {
  const errors: string[] = [];
  if (config.autoPrOnArchive && !config.autoPush) {
    errors.push(
      "autoPrOnArchive requires autoPush=true (no auto-PR without push; req 08.4b).",
    );
  }
  return errors;
}

/* ------------------------------------------------------------------ *
 * Spawn plumbing
 * ------------------------------------------------------------------ */

/** Injectable spawn signature (defaults to `node:child_process.spawn`). */
export type GitSpawnImpl = (
  cmd: string,
  args: string[],
  opts: { cwd: string; stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcess;

/** Default production spawn binding. */
const defaultGitSpawn: GitSpawnImpl = (cmd, args, opts) =>
  defaultSpawn(cmd, args, opts);

/** Options shared by every operation in this module. */
export interface GitOpOptions {
  /** Injectable spawn (tests pass a recording fake; prod omits this). */
  spawn?: GitSpawnImpl;
}

/**
 * Run a `git` command and return its captured stdout + exit code.
 *
 * Never throws on a non-zero exit — the caller decides what to do with the
 * code + stdout (e.g. conflict detection in {@link syncFromRemote}).
 */
async function runGit(
  args: string[],
  cwd: string,
  spawn?: GitSpawnImpl,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const impl = spawn ?? defaultGitSpawn;
  const child = impl("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve) => {
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    child.stdout?.on("data", (c: string | Buffer) =>
      stdoutChunks.push(typeof c === "string" ? c : c.toString("utf8")),
    );
    child.stderr?.on("data", (c: string | Buffer) =>
      stderrChunks.push(typeof c === "string" ? c : c.toString("utf8")),
    );
    child.on("error", () =>
      resolve({
        code: 1,
        stdout: stdoutChunks.join(""),
        stderr: "spawn error",
      }),
    );
    child.on("close", (code, signal) => {
      // A null code means the process was terminated by a signal (e.g. SIGTERM,
      // SIGKILL). Treating that as success (code 0) masks real failures.
      if (code === null || signal) {
        resolve({
          code: 1,
          stdout: stdoutChunks.join(""),
          stderr: signal ? `process terminated by ${signal}` : stderrChunks.join(""),
        });
        return;
      }
      resolve({
        code,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Sandboxed clone (req project-workspace: Sandboxed clone M-7 hardened)
 * ------------------------------------------------------------------ */

/**
 * Materialize a sandboxed clone of `remoteUrl` into `destDir`.
 *
 * Security hardening (M-7 / spec "Sandboxed clone"):
 *   - `--no-checkout`: do not auto-checkout the default (untrusted) branch.
 *   - `core.hooksPath=/dev/null`: disable ALL upstream hooks so no
 *     post-checkout / pre-commit hook from the foreign repo executes.
 *   - Submodule recursion uses `--filter=blob:none`: blobs are fetched
 *     lazily, so a malicious submodule cannot force materialisation of
 *     large/unbounded objects.
 *
 * The clone is the ONLY path the projection layer may read from.
 */
export async function cloneSandboxed(
  remoteUrl: string,
  destDir: string,
  opts: GitOpOptions = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  // 1) Clone without checkout, disabling hooks on the new repo via `-c`.
  //    cwd is the PARENT of destDir — destDir does not exist yet.
  const cloneResult = await runGit(
    [
      "-c",
      "core.hooksPath=/dev/null",
      "clone",
      "--no-checkout",
      "--filter=blob:none",
      remoteUrl,
      destDir,
    ],
    dirname(destDir),
    opts.spawn,
  );
  if (cloneResult.code !== 0) return cloneResult;

  // 2) Re-assert the hooks disablement on the freshly-cloned working copy
  //    (the `-c` only applies during clone, not to later invocations), then
  //    initialise + update submodules with blob filtering so no submodule
  //    hooks run either.
  await runGit(
    [
      "-c",
      "core.hooksPath=/dev/null",
      "config",
      "core.hooksPath",
      "/dev/null",
    ],
    destDir,
    opts.spawn,
  );
  const subResult = await runGit(
    [
      "-c",
      "core.hooksPath=/dev/null",
      "submodule",
      "update",
      "--init",
      "--recursive",
      "--filter=blob:none",
    ],
    destDir,
    opts.spawn,
  );
  return subResult.code === 0 ? cloneResult : subResult;
}

/* ------------------------------------------------------------------ *
 * Sync (req 08.4c: conflict surfaces a merge result, not a throw)
 * ------------------------------------------------------------------ */

/** Outcome of a {@link syncFromRemote} pull. */
export type SyncResult =
  | { status: "ok" }
  | { status: "conflict"; conflictedPaths: string[] }
  | { status: "error"; message: string };

/** Pattern matching git's `CONFLICT (content): Merge conflict in <path>` line. */
const CONFLICT_PATH_RE = /^CONFLICT \([^)]*\): Merge conflict in (.+)$/gm;

/**
 * Pull from the configured remote into the current branch.
 *
 * On a clean fast-forward or auto-merge this resolves to `{ status: "ok" }`.
 * On a merge conflict (non-zero exit + `CONFLICT (...)` lines in stdout) it
 * resolves to `{ status: "conflict", conflictedPaths }` so the UI can surface
 * the 3-way merge flow (INV-7) instead of failing silently. Any other
 * failure resolves to `{ status: "error" }`.
 */
export async function syncFromRemote(
  repoDir: string,
  opts: GitOpOptions = {},
): Promise<SyncResult> {
  const result = await runGit(["pull", "--no-edit", "--no-rebase"], repoDir, opts.spawn);
  if (result.code === 0) return { status: "ok" };
  const paths = [...result.stdout.matchAll(CONFLICT_PATH_RE)].map((m) =>
    m[1].trim(),
  );
  if (paths.length > 0) {
    return { status: "conflict", conflictedPaths: paths };
  }
  return { status: "error", message: result.stderr || result.stdout };
}

/* ------------------------------------------------------------------ *
 * Branch ops (req 08.4b: branch-per-change)
 * ------------------------------------------------------------------ */

/**
 * Create (and switch to) a per-change branch named
 * `<prefix>/<change-name>` in `repoDir`.
 */
export async function createChangeBranch(
  repoDir: string,
  changeName: string,
  config: Pick<GitIntegrationConfig, "branchPrefix"> = {
    branchPrefix: "openspec",
  },
  opts: GitOpOptions = {},
): Promise<{ branch: string; code: number }> {
  const branch = buildBranchName(config.branchPrefix, changeName);
  const result = await runGit(
    ["checkout", "-b", branch],
    repoDir,
    opts.spawn,
  );
  return { branch, code: result.code };
}

/**
 * Commit staged changes with a structured dashboard commit message
 * (req 08.4a). Returns the exit code (0 on success).
 */
export async function commitStructured(
  repoDir: string,
  verb: string,
  entity: string,
  opts: GitOpOptions = {},
): Promise<{ message: string; code: number }> {
  const message = buildCommitMessage(verb, entity);
  const result = await runGit(
    ["commit", "-m", message],
    repoDir,
    opts.spawn,
  );
  return { message, code: result.code };
}

/**
 * Push `branch` to the configured remote.
 *
 * Push is ALWAYS explicit and user-initiated (req 08.4b). Neither
 * {@link cloneSandboxed}, {@link syncFromRemote}, {@link commitStructured},
 * nor {@link createChangeBranch} ever push — this is the sole entry point.
 */
export async function pushBranch(
  repoDir: string,
  branch: string,
  opts: GitOpOptions = {},
): Promise<{ code: number }> {
  const result = await runGit(
    ["push", "-u", "origin", branch],
    repoDir,
    opts.spawn,
  );
  return { code: result.code };
}

/* ------------------------------------------------------------------ *
 * Internal helpers
 * ------------------------------------------------------------------ */

/** Escape a literal string for use inside a `RegExp`. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
