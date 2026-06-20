/**
 * Task 4.2 — Server helper to detect authenticated CLI: unit tests.
 *
 * `src/lib/cli-auth.ts` (created in this task) provides:
 *   - `resolveCliForHost(host)` — pure mapping URL host → required CLI
 *     (`gh` for `github.com`, `glab` for `gitlab.com`, `null` otherwise)
 *   - `parseHostFromUrl(url)` — host extraction from https + SCP-style URLs
 *   - `checkCliAuth(cli, env, spawnImpl)` — runs `<cli> auth status --json`
 *     (injectable spawn) and reports the auth-status outcome
 *   - `checkRemoteCliAuth(url, env, spawnImpl)` — combines both and returns
 *     an actionable summary with a human-readable message
 *
 * The spawn implementation is injectable, so these tests drive the helper
 * with a fake spawn (no real process), mirroring the `openspec-init` test
 * pattern.
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import {
  resolveCliForHost,
  parseHostFromUrl,
  checkCliAuth,
  checkRemoteCliAuth,
  type CliAuthSpawnFn,
} from "@/lib/cli-auth";

/** Build a fake ChildProcess whose stdout/stderr drain then emit `close`. */
function fakeChild(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: Error;
}): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as ChildProcess & { stdout: Readable }).stdout = Readable.from(
    opts.stdout != null ? [opts.stdout] : [],
  );
  (child as ChildProcess & { stderr: Readable }).stderr = Readable.from(
    opts.stderr != null ? [opts.stderr] : [],
  );
  setImmediate(() => {
    if (opts.error) child.emit("error", opts.error);
    else child.emit("close", opts.exitCode ?? 0);
  });
  return child;
}

function makeSpawn(
  child: ChildProcess,
  captured: { cmd?: string; args?: string[] },
): CliAuthSpawnFn {
  return (cmd, args) => {
    captured.cmd = cmd;
    captured.args = args;
    return child;
  };
}

describe("src/lib/cli-auth — task 4.2 CLI detection helper", () => {
  describe("resolveCliForHost", () => {
    it("maps github.com → gh", () => {
      expect(resolveCliForHost("github.com")).toBe("gh");
    });

    it("maps gitlab.com → glab", () => {
      expect(resolveCliForHost("gitlab.com")).toBe("glab");
    });

    it("is case-insensitive and trims + strips www. prefix", () => {
      expect(resolveCliForHost("WWW.GitHub.com")).toBe("gh");
      expect(resolveCliForHost("  www.gitlab.com  ")).toBe("glab");
    });

    it("returns null for unsupported hosts", () => {
      expect(resolveCliForHost("bitbucket.org")).toBeNull();
      expect(resolveCliForHost("example.com")).toBeNull();
      expect(resolveCliForHost("")).toBeNull();
    });
  });

  describe("parseHostFromUrl", () => {
    it("extracts the host from an https URL", () => {
      expect(parseHostFromUrl("https://github.com/org/repo")).toBe(
        "github.com",
      );
      expect(parseHostFromUrl("https://gitlab.com/org/repo.git")).toBe(
        "gitlab.com",
      );
    });

    it("extracts the host from an SCP-style git URL", () => {
      expect(parseHostFromUrl("git@github.com:org/repo.git")).toBe(
        "github.com",
      );
    });

    it("returns null for unparseable / non-http(s) non-scp input", () => {
      expect(parseHostFromUrl("")).toBeNull();
      expect(parseHostFromUrl("not a url")).toBeNull();
      expect(parseHostFromUrl("ftp://github.com/x")).toBeNull();
    });
  });

  describe("checkCliAuth", () => {
    it("spawns `gh auth status --json host,user` and reports authenticated=true on exit 0", async () => {
      const child = fakeChild({
        stdout: JSON.stringify({ host: "github.com", user: "octocat" }),
        exitCode: 0,
      });
      const captured: { cmd?: string; args?: string[] } = {};
      const res = await checkCliAuth("gh", {}, makeSpawn(child, captured));

      expect(captured.cmd).toBe("gh");
      expect(captured.args).toEqual([
        "auth",
        "status",
        "--json",
        "host,user",
      ]);
      expect(res).toEqual({
        status: "ok",
        authenticated: true,
        host: "github.com",
        user: "octocat",
      });
    });

    it("spawns `glab auth status --json host` for the glab CLI", async () => {
      const child = fakeChild({
        stdout: JSON.stringify({ host: "gitlab.com" }),
        exitCode: 0,
      });
      const captured: { cmd?: string; args?: string[] } = {};
      const res = await checkCliAuth("glab", {}, makeSpawn(child, captured));

      expect(captured.cmd).toBe("glab");
      expect(captured.args).toEqual(["auth", "status", "--json", "host"]);
      expect(res).toMatchObject({ status: "ok", authenticated: true });
    });

    it("reports status=missing when the binary is absent (ENOENT-style stderr)", async () => {
      const child = fakeChild({
        stderr: "env: gh: No such file or directory",
        exitCode: 127,
      });
      const res = await checkCliAuth("gh", {}, makeSpawn(child, {}));
      expect(res.status).toBe("missing");
    });

    it("reports status=error on a non-zero exit that isn't 'missing'", async () => {
      const child = fakeChild({
        stderr: "You are not logged in.",
        exitCode: 4,
      });
      const res = await checkCliAuth("gh", {}, makeSpawn(child, {}));
      expect(res.status).toBe("error");
      if (res.status === "error") {
        expect(res.reason).toMatch(/not logged in/i);
      }
    });
  });

  describe("checkRemoteCliAuth", () => {
    it("is actionable when an authenticated gh matches a github.com URL", async () => {
      const child = fakeChild({
        stdout: JSON.stringify({ host: "github.com", user: "octocat" }),
        exitCode: 0,
      });
      const res = await checkRemoteCliAuth(
        "https://github.com/org/repo",
        {},
        makeSpawn(child, {}),
      );
      expect(res.host).toBe("github.com");
      expect(res.requiredCli).toBe("gh");
      expect(res.actionable).toBe(true);
      expect(res.message).toMatch(/authenticated/i);
    });

    it("is not actionable when the host has no supported CLI", async () => {
      const child = fakeChild({ exitCode: 0 });
      const res = await checkRemoteCliAuth(
        "https://bitbucket.org/org/repo",
        {},
        makeSpawn(child, {}),
      );
      expect(res.requiredCli).toBeNull();
      expect(res.actionable).toBe(false);
    });

    it("is not actionable when the CLI is missing", async () => {
      const child = fakeChild({
        stderr: "glab: command not found",
        exitCode: 127,
      });
      const res = await checkRemoteCliAuth(
        "https://gitlab.com/org/repo",
        {},
        makeSpawn(child, {}),
      );
      expect(res.requiredCli).toBe("glab");
      expect(res.actionable).toBe(false);
      expect(res.message).toMatch(/glab/i);
    });
  });
});
