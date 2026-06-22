/**
 * Task 6.2 — Git integration (clone, sync, branch ops) unit tests.
 *
 * Spec source: req 08 §8.4 ("Git integration") in
 * `flow/requirements/08-integration-sync.md`, plus the sandboxed-clone
 * requirement in `openspec/changes/build-openspec-dashboard-mvp/specs/
 * project-workspace/spec.md` (Requirement "Sandboxed clone (M-7 hardened)").
 *
 * Behaviour asserted here:
 *
 *  (a) Structured commit messages: `chore(openspec): <verb> <entity>`,
 *      machine-parseable back into `(verb, entity)`.
 *  (b) Branch-per-change: `<prefix>/<change-name>`; push is ALWAYS explicit
 *      and user-initiated — `autoPush` defaults to `false`.
 *  (c) `git pull` conflict surfaces a typed merge result instead of throwing.
 *  (d) Sandboxed clone disables hooks, uses `--filter=blob:none` for
 *      submodules, and does not auto-checkout untrusted branches.
 *  (e) The "auto-PR on archive" path requires `autoPush: true` — there is no
 *      "auto-PR without push" mode (req 08.4b).
 */
import { describe, it, expect } from "vitest";
import type { ChildProcess } from "node:child_process";
import { Readable } from "node:stream";
import {
  buildCommitMessage,
  parseCommitMessage,
  buildBranchName,
  parseBranchName,
  defaultGitIntegrationConfig,
  validateGitIntegrationConfig,
  type GitIntegrationConfig,
  type GitSpawnImpl,
} from "@/lib/git";

/**
 * A minimal spawn fake: returns a ChildProcess whose stdout/stderr/exit code
 * are fully controlled by the test. Used to assert the EXACT argv passed to
 * `git` without ever shelling out.
 */
function fakeChild(opts: {
  stdout?: string;
  exitCode?: number;
}): ChildProcess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child: any = {};
  const stdout = Readable.from(opts.stdout ? [opts.stdout] : []);
  const stderr = Readable.from([]);
  child.stdout = stdout;
  child.stderr = stderr;
  child.exitCode = opts.exitCode ?? 0;
  child.killed = false;
  child.kill = () => true;
  // `runGit` resolves on the `close` event — emit it only AFTER both
  // stdout and stderr have ended so the captured text is complete.
  let pending = 2;
  const maybeClose = () => {
    pending -= 1;
    if (pending <= 0) {
      queueMicrotask(() => {
        child.emit?.("close", child.exitCode);
        child.onCloseFns?.forEach((fn: (code: number) => void) =>
          fn(child.exitCode),
        );
      });
    }
  };
  stdout.on("end", maybeClose);
  stderr.on("end", maybeClose);
  child.on = (event: string, cb: (...a: unknown[]) => void) => {
    if (event === "close") {
      child.onCloseFns = [...(child.onCloseFns ?? []), cb];
    }
    return child;
  };
  child.removeListener = () => child;
  return child as ChildProcess;
}

/** Recording spawn that captures every invocation's argv + cwd. */
function recordingSpawn(opts: {
  stdout?: string;
  exitCode?: number;
  onArgs?: (cmd: string, args: string[], cwd: string) => void;
}): GitSpawnImpl {
  return (cmd, args, spawnOpts) => {
    opts.onArgs?.(cmd, args, spawnOpts.cwd);
    return fakeChild({ stdout: opts.stdout, exitCode: opts.exitCode });
  };
}

describe("buildCommitMessage (req 08.4a)", () => {
  it("formats as chore(openspec): <verb> <entity>", () => {
    expect(buildCommitMessage("add", "spec capabilities")).toBe(
      "chore(openspec): add spec capabilities",
    );
  });

  it("is round-trippable via parseCommitMessage", () => {
    const msg = buildCommitMessage("archive", "change foo-bar");
    const parsed = parseCommitMessage(msg);
    expect(parsed).toEqual({ verb: "archive", entity: "change foo-bar" });
  });

  it("parseCommitMessage returns null for non-conforming messages", () => {
    expect(parseCommitMessage("wip stuff")).toBeNull();
    expect(parseCommitMessage("feat: real work")).toBeNull();
  });
});

describe("buildBranchName / parseBranchName (req 08.4b)", () => {
  it("builds <prefix>/<change-name>", () => {
    expect(buildBranchName("openspec", "build-dashboard-mvp")).toBe(
      "openspec/build-dashboard-mvp",
    );
  });

  it("round-trips via parseBranchName", () => {
    const parsed = parseBranchName("openspec/build-dashboard-mvp");
    expect(parsed).toEqual({
      prefix: "openspec",
      changeName: "build-dashboard-mvp",
    });
  });

  it("parseBranchName returns null for a branch without a prefix", () => {
    expect(parseBranchName("main")).toBeNull();
  });

  it("buildBranchName strips characters invalid in git refnames (backslash, ~, ^, :, ?, *, [, {, })", () => {
    // Backslash in particular is forbidden by git refs and must be stripped;
    // regression for cubic finding that the prior regex omitted backslash.
    const out = buildBranchName("openspec", "feat\\~^:?*[{bug");
    expect(out).toBe("openspec/featbug");
    expect(out).not.toMatch(/[~^:?*[\\{}]/);
  });
});

describe("defaultGitIntegrationConfig (req 08.4b push is always explicit)", () => {
  it("defaults autoPush to false", () => {
    expect(defaultGitIntegrationConfig().autoPush).toBe(false);
  });

  it("defaults commitOnSave to false (off until configured)", () => {
    expect(defaultGitIntegrationConfig().commitOnSave).toBe(false);
  });

  it("defaults branchPerChange to false (off until configured)", () => {
    expect(defaultGitIntegrationConfig().branchPerChange).toBe(false);
  });

  it("uses a stable branch prefix", () => {
    expect(defaultGitIntegrationConfig().branchPrefix).toBe("openspec");
  });
});

describe("validateGitIntegrationConfig (req 08.4b: no auto-PR without push)", () => {
  it("rejects autoPrOnArchive=true when autoPush=false", () => {
    const errors = validateGitIntegrationConfig({
      ...defaultGitIntegrationConfig(),
      autoPrOnArchive: true,
      autoPush: false,
    });
    expect(
      errors.some((e) => /autoPrOnArchive.*autoPush/i.test(e)),
    ).toBe(true);
  });

  it("accepts autoPrOnArchive=true when autoPush=true", () => {
    const errors = validateGitIntegrationConfig({
      ...defaultGitIntegrationConfig(),
      autoPrOnArchive: true,
      autoPush: true,
    });
    expect(errors).toEqual([]);
  });
});

describe("cloneSandboxed (req project-workspace Sandboxed clone M-7)", () => {
  it("disables hooks, filters blobs for submodules, no checkout of untrusted branches", async () => {
    const seen: { cmd: string; args: string[]; cwd: string }[] = [];
    const spawn = recordingSpawn({
      stdout: "",
      onArgs: (cmd, args, cwd) => seen.push({ cmd, args, cwd }),
    });
    const { cloneSandboxed } = await import("@/lib/git");

    await cloneSandboxed(
      "https://example.com/team/repo.git",
      "/sandboxes/abc",
      { spawn },
    );

    // A single `git clone` invocation, or a clone followed by config +
    // submodule init. Assert the security-relevant flags are present across
    // the recorded calls.
    const allArgs = seen.flatMap((s) => s.args);
    expect(allArgs).toContain("--no-checkout");
    expect(allArgs).toContain("core.hooksPath=/dev/null");
    // Submodule recursion must use --filter=blob:none.
    const joined = seen.map((s) => s.args.join(" ")).join(" || ");
    expect(joined).toMatch(/submodule.*--filter=blob:none|--filter=blob:none.*submodule/);
    expect(seen[0].cmd).toBe("git");
  });
});

describe("syncFromRemote (req 08.4c: conflict surfaces a merge result)", () => {
  it("returns an OK result on clean fast-forward", async () => {
    const spawn = recordingSpawn({ stdout: "Updating abc..def\nFast-forward\n" });
    const { syncFromRemote } = await import("@/lib/git");
    const result = await syncFromRemote("/repo", { spawn });
    expect(result.status).toBe("ok");
  });

  it("returns a CONFLICT result (not throws) when git reports merge conflicts", async () => {
    const spawn = recordingSpawn({
      stdout: "CONFLICT (content): Merge conflict in openspec/specs/x/spec.md\n",
      exitCode: 1,
    });
    const { syncFromRemote } = await import("@/lib/git");
    const result = await syncFromRemote("/repo", { spawn });
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.conflictedPaths).toContain("openspec/specs/x/spec.md");
  });
});

describe("pushBranch (req 08.4b: push is ALWAYS explicit + user-initiated)", () => {
  it("is never invoked by clone or sync — only by an explicit pushBranch call", async () => {
    const calls: string[] = [];
    const spawn = recordingSpawn({
      onArgs: (cmd, args) => calls.push(`${cmd} ${args.join(" ")}`),
    });
    const { cloneSandboxed, syncFromRemote, pushBranch } = await import("@/lib/git");

    await cloneSandboxed("https://example.com/r.git", "/r", { spawn });
    await syncFromRemote("/r", { spawn });
    // No push has happened yet.
    expect(calls.some((c) => /\bpush\b/.test(c))).toBe(false);

    await pushBranch("/r", "openspec/build-dashboard-mvp", { spawn });
    expect(calls.some((c) => /git push/.test(c))).toBe(true);
  });
});
