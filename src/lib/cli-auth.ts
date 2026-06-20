/**
 * Server helper to detect an authenticated `gh` / `glab` CLI (task 4.2).
 *
 * Spec requirement "Remote git enrollment via gh / glab (planned, stubbed)":
 *   The flow MUST detect which authenticated CLI is available (`gh` for
 *   `github.com`, `glab` for `gitlab.com`) by shelling out to the CLI's
 *   auth-status command.
 *
 * This module provides:
 *
 *   - `resolveCliForHost(host)` — pure mapping from a URL host to the
 *     required CLI name (`gh` or `glab`). Returns `null` for unknown hosts.
 *   - `parseHostFromUrl(url)` — host extraction from https + SCP-style URLs.
 *   - `checkCliAuth(cli, env, spawnImpl)` — runs `<cli> auth status --json`
 *     (injectable spawn) and returns the auth-status outcome.
 *   - `checkRemoteCliAuth(url, env, spawnImpl)` — combines the above and
 *     returns a summary describing which CLI is required, whether it is
 *     installed and authenticated, plus a human-readable message.
 *
 * The spawn implementation is injectable so the helper can be unit-tested
 * without spawning a real process (mirrors the pattern already used by the
 * OpenSpec-init wrapper in `openspec-init.ts`, design decision D-MPCD-5).
 */
import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { EnvRecord } from "@/lib/openspec-init";

/** The CLI names the remote-git enrollment flow understands. */
export type GitCli = "gh" | "glab";

/** Injectable spawn signature mirroring `openspec-init`. */
export type CliAuthSpawnFn = (
  cmd: string,
  args: string[],
  opts: { stdio: ["ignore", "pipe", "pipe"] },
) => ChildProcess;

/**
 * Resolve the required CLI for a given URL host.
 *
 * - `github.com` (and its `www.` variant) → `gh`
 * - `gitlab.com` (and its `www.` variant) → `glab`
 * - Anything else → `null` (unknown host, no supported CLI mapping).
 *
 * Comparison is case-insensitive and tolerates surrounding whitespace.
 */
export function resolveCliForHost(host: string): GitCli | null {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (h === "github.com") return "gh";
  if (h === "gitlab.com") return "glab";
  return null;
}

/**
 * Parse a remote repository URL and return its host.
 *
 * Supports both https URLs (`https://github.com/org/repo`) and SCP-style
 * Git URLs (`git@github.com:org/repo`). Returns `null` when the URL cannot
 * be parsed into a host.
 */
export function parseHostFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  // SCP-style: git@github.com:org/repo  (user@host:path)
  const scpMatch = trimmed.match(/^[A-Za-z0-9_-]+@([^:/]+):.*$/);
  if (scpMatch && !scpMatch[1].includes("/")) {
    return scpMatch[1];
  }
  // https:// or http://
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.host || null;
  } catch {
    return null;
  }
}

/** Outcome of checking a CLI's auth status. */
export type CliAuthResult =
  | { status: "ok"; authenticated: true; host: string; user?: string }
  | { status: "ok"; authenticated: false; host?: string }
  | { status: "missing"; reason: string }
  | { status: "error"; reason: string };

/** Args the helper passes to each CLI's auth-status command. */
function authStatusArgs(cli: GitCli): string[] {
  // `gh` only exposes `hosts` (plural, array of authenticated hosts); it
  // rejects unknown fields like `user`. `glab` exposes `host` (singular).
  return cli === "gh"
    ? ["auth", "status", "--json", "hosts"]
    : ["auth", "status", "--json", "host"];
}

/**
 * Run `<cli> auth status --json` and return whether the CLI reports being
 * authenticated for a host.
 *
 * - Exit 0 + parseable JSON with a `host` → authenticated for that host.
 * - Exit 0 but unparseable JSON → treat as authenticated defensively.
 * - Non-zero exit with an ENOENT/"not found" signal → `missing`.
 * - Any other non-zero exit → `error` with stderr as the reason.
 */
export async function checkCliAuth(
  cli: GitCli,
  env: EnvRecord = process.env,
  spawnImpl: CliAuthSpawnFn = defaultSpawn,
): Promise<CliAuthResult> {
  void env; // reserved for future per-process overrides (mirrors openspec-init)
  const child = spawnImpl(cli, authStatusArgs(cli), {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const { stdout, stderr, exitCode } = await collectChild(child);

  if (exitCode === 0) {
    const entry = safeParseFirstObject(stdout);
    // `gh` returns `hosts` (string[]); `glab` returns `host` (string).
    const hostList = Array.isArray(entry?.hosts)
      ? (entry.hosts as unknown[]).filter(
          (h): h is string => typeof h === "string",
        )
      : [];
    const singleHost =
      typeof entry?.host === "string" ? (entry.host as string) : null;

    if (hostList.length > 0) {
      return {
        status: "ok",
        authenticated: true,
        host: hostList[0] as string,
        ...(typeof entry.user === "string" ? { user: entry.user } : {}),
      };
    }
    if (singleHost) {
      return {
        status: "ok",
        authenticated: true,
        host: singleHost,
        ...(typeof entry.user === "string" ? { user: entry.user } : {}),
      };
    }
    // Authenticated but no host key — trust the successful exit.
    return { status: "ok", authenticated: true, host: "unknown" };
  }

  const sig = (stderr + stdout).toLowerCase();
  if (
    sig.includes("enoent") ||
    sig.includes("not found") ||
    sig.includes("no such file")
  ) {
    return {
      status: "missing",
      reason: `${cli} is not installed or not on PATH`,
    };
  }
  const reason =
    stderr.trim() || stdout.trim() || `${cli} exited with code ${exitCode}`;
  return { status: "error", reason };
}

/**
 * Top-level detection: parse the URL, resolve the CLI, check its auth status.
 */
export interface RemoteCliCheckResult {
  url: string;
  host: string | null;
  requiredCli: GitCli | null;
  cliResult: CliAuthResult | null;
  actionable: boolean;
  message: string;
}

export async function checkRemoteCliAuth(
  url: string,
  env: EnvRecord = process.env,
  spawnImpl: CliAuthSpawnFn = defaultSpawn,
): Promise<RemoteCliCheckResult> {
  const host = parseHostFromUrl(url);
  if (!host) {
    return {
      url,
      host: null,
      requiredCli: null,
      cliResult: null,
      actionable: false,
      message: "Could not parse a host from the given URL.",
    };
  }
  const requiredCli = resolveCliForHost(host);
  if (!requiredCli) {
    return {
      url,
      host,
      requiredCli: null,
      cliResult: null,
      actionable: false,
      message: `Host "${host}" is not a supported provider (need github.com or gitlab.com).`,
    };
  }
  const cliResult = await checkCliAuth(requiredCli, env, spawnImpl);
  switch (cliResult.status) {
    case "ok":
      if (cliResult.authenticated) {
        return {
          url,
          host,
          requiredCli,
          cliResult,
          actionable: true,
          message: `${requiredCli} is authenticated for ${cliResult.host}.`,
        };
      }
      return {
        url,
        host,
        requiredCli,
        cliResult,
        actionable: false,
        message: `${requiredCli} is installed but not authenticated. Run \`${requiredCli} auth login\` and try again.`,
      };
    case "missing":
      return {
        url,
        host,
        requiredCli,
        cliResult,
        actionable: false,
        message: `${requiredCli} is required for "${host}" but is not installed or not on PATH.`,
      };
    case "error":
      return {
        url,
        host,
        requiredCli,
        cliResult,
        actionable: false,
        message: `${requiredCli} auth check failed: ${cliResult.reason}`,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                   */
/* ------------------------------------------------------------------ */

interface ChildOutcome {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function collectChild(child: ChildProcess): Promise<ChildOutcome> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", (err: Error & { code?: string }) => {
      // Treat spawn failure (ENOENT) as a non-zero exit whose stderr hints at
      // the missing binary, so callers can classify it uniformly.
      resolve({
        stdout,
        stderr: err.code === "ENOENT" ? "ENOENT" : stderr || err.message,
        exitCode: 127,
      });
    });
    child.once("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

/** Parse JSON, accepting either a single object or an array (take [0]). */
function safeParseFirstObject(
  raw: string,
): { host?: string; user?: string } | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const first = parsed[0];
      return typeof first === "object" && first !== null ? first : null;
    }
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
